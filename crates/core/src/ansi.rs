/// Strip all ANSI escape sequences from a string, returning only visible text.
pub fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            match chars.peek() {
                Some(&'[') => {
                    chars.next();
                    while let Some(&next) = chars.peek() {
                        chars.next();
                        if next.is_ascii_alphabetic() {
                            break;
                        }
                    }
                }
                Some(&']') => {
                    chars.next();
                    while let Some(next) = chars.next() {
                        if next == '\x07' {
                            break;
                        }
                        if next == '\x1b' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                Some(&c2) if c2.is_ascii_alphabetic() || c2 == '(' || c2 == ')' || c2 == '#' => {
                    chars.next();
                }
                _ => {}
            }
        } else {
            result.push(c);
        }
    }
    result
}

/// Check if a line is visually empty (only whitespace after stripping ANSI codes).
pub fn is_visually_empty(s: &str) -> bool {
    strip_ansi(s).trim().is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_text_unchanged() {
        assert_eq!(strip_ansi("hello world"), "hello world");
    }

    #[test]
    fn removes_color_codes() {
        assert_eq!(strip_ansi("\x1b[31mred\x1b[0m text"), "red text");
    }

    #[test]
    fn removes_256_color() {
        assert_eq!(strip_ansi("\x1b[38;5;100mcolored\x1b[0m"), "colored");
    }

    #[test]
    fn removes_rgb_color() {
        assert_eq!(strip_ansi("\x1b[38;2;255;0;128mrgb\x1b[0m"), "rgb");
    }

    #[test]
    fn removes_osc_sequences() {
        assert_eq!(strip_ansi("\x1b]0;title\x07text"), "text");
    }

    #[test]
    fn empty_string() {
        assert_eq!(strip_ansi(""), "");
    }

    #[test]
    fn visually_empty_with_ansi() {
        assert!(is_visually_empty("\x1b[0m"));
        assert!(is_visually_empty("\x1b[39m  \x1b[0m"));
        assert!(is_visually_empty("   "));
        assert!(is_visually_empty(""));
    }

    #[test]
    fn not_visually_empty() {
        assert!(!is_visually_empty("\x1b[31mhello\x1b[0m"));
        assert!(!is_visually_empty("text"));
    }
}
