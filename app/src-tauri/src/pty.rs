use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::panic;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter};

struct PtySession {
    writer: Box<dyn Write + Send>,
    pair: portable_pty::PtyPair,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

/// Find the last valid UTF-8 boundary in a byte slice.
/// Returns the number of bytes that form valid UTF-8 from the start.
fn valid_utf8_len(buf: &[u8]) -> usize {
    match std::str::from_utf8(buf) {
        Ok(_) => buf.len(),
        Err(e) => e.valid_up_to(),
    }
}

static PTY_SESSION: std::sync::LazyLock<Mutex<Option<PtySession>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

static GENERATION: AtomicU64 = AtomicU64::new(0);

fn do_close() {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    let mut guard = match PTY_SESSION.lock() {
        Ok(g) => g,
        Err(e) => e.into_inner(),
    };
    if let Some(mut s) = guard.take() {
        // Kill and wait in a separate thread with timeout to avoid blocking
        thread::spawn(move || {
            let _ = panic::catch_unwind(panic::AssertUnwindSafe(|| {
                let _ = s.child.kill();
            }));
            let _ = panic::catch_unwind(panic::AssertUnwindSafe(|| {
                let _ = s.child.wait();
            }));
            // Drop s here — this drops the PTY pair, writer, etc.
            drop(s);
        });
    }
}

pub fn open(app_handle: AppHandle, session_name: &str, cols: u16, rows: u16) -> Result<(), String> {
    // Close any existing session
    do_close();

    // Give old session time to fully tear down
    thread::sleep(std::time::Duration::from_millis(100));

    let gen = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;

    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let mut cmd = CommandBuilder::new("tmux");
    cmd.args(["-u", "attach-session", "-t", session_name]);
    cmd.env("TERM", "xterm-256color");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_CTYPE", "en_US.UTF-8");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn: {}", e))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get writer: {}", e))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get reader: {}", e))?;

    {
        let mut guard = match PTY_SESSION.lock() {
            Ok(g) => g,
            Err(e) => e.into_inner(),
        };
        *guard = Some(PtySession {
            writer,
            pair,
            child,
        });
    }

    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        // Buffer for incomplete UTF-8 sequences that span chunk boundaries
        let mut pending: Vec<u8> = Vec::new();
        loop {
            if GENERATION.load(Ordering::SeqCst) != gen {
                break;
            }
            let result = panic::catch_unwind(panic::AssertUnwindSafe(|| reader.read(&mut buf)));
            match result {
                Ok(Ok(0)) => break,
                Ok(Ok(n)) => {
                    if GENERATION.load(Ordering::SeqCst) != gen {
                        break;
                    }
                    pending.extend_from_slice(&buf[..n]);
                    let valid = valid_utf8_len(&pending);
                    if valid > 0 {
                        // Safe: we just verified these bytes are valid UTF-8
                        let data = String::from_utf8(pending[..valid].to_vec()).unwrap_or_default();
                        pending = pending[valid..].to_vec();
                        let _ = app_handle.emit("pty-output", data);
                    }
                    // If valid == 0 and pending is non-empty, we have an incomplete
                    // multi-byte sequence — wait for the next read to complete it.
                    // Safety valve: if pending grows too large without valid UTF-8,
                    // flush it lossy to avoid unbounded memory growth.
                    if pending.len() > 16 {
                        let data = String::from_utf8_lossy(&pending).to_string();
                        pending.clear();
                        let _ = app_handle.emit("pty-output", data);
                    }
                }
                Ok(Err(_)) => break,
                Err(_) => break, // panic in read — just stop
            }
        }
    });

    Ok(())
}

pub fn write_data(data: &[u8]) -> Result<(), String> {
    let mut guard = match PTY_SESSION.lock() {
        Ok(g) => g,
        Err(e) => e.into_inner(),
    };
    if let Some(ref mut s) = *guard {
        s.writer
            .write_all(data)
            .map_err(|e| format!("Write failed: {}", e))?;
        s.writer
            .flush()
            .map_err(|e| format!("Flush failed: {}", e))?;
        Ok(())
    } else {
        Err("No PTY session".to_string())
    }
}

pub fn resize(cols: u16, rows: u16) -> Result<(), String> {
    let guard = match PTY_SESSION.lock() {
        Ok(g) => g,
        Err(e) => e.into_inner(),
    };
    if let Some(ref s) = *guard {
        s.pair
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Resize failed: {}", e))?;
        Ok(())
    } else {
        Err("No PTY session".to_string())
    }
}

pub fn close() {
    let _ = panic::catch_unwind(|| {
        do_close();
    });
}
