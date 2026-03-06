use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Paragraph};
use ratatui::Frame;

use crate::app::App;

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let lines: Vec<Line> = if app.pane_preview.is_empty() {
        vec![Line::styled(
            "No preview available",
            Style::new().fg(Color::DarkGray),
        )]
    } else {
        app.pane_preview
            .iter()
            .map(|l| parse_ansi_line(l))
            .collect()
    };

    let block = Block::bordered().title(" Preview ");
    let inner_height = area.height.saturating_sub(2);
    let total_lines = lines.len() as u16;
    let max_scroll = total_lines.saturating_sub(inner_height);
    let scroll = app.preview_scroll.min(max_scroll);
    let paragraph = Paragraph::new(lines).block(block).scroll((scroll, 0));
    frame.render_widget(paragraph, area);
}

fn parse_ansi_line(s: &str) -> Line<'static> {
    let mut spans: Vec<Span<'static>> = Vec::new();
    let mut current_style = Style::default();
    let mut buf = String::new();
    let mut chars = s.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '\x1b' {
            if chars.peek() == Some(&'[') {
                // Flush current buffer
                if !buf.is_empty() {
                    spans.push(Span::styled(buf.clone(), current_style));
                    buf.clear();
                }
                chars.next(); // consume '['
                let mut params = String::new();
                while let Some(&next) = chars.peek() {
                    if next.is_ascii_alphabetic() || next == 'm' {
                        chars.next();
                        break;
                    }
                    params.push(next);
                    chars.next();
                }
                current_style = apply_sgr(&params, current_style);
            }
        } else {
            buf.push(c);
        }
    }

    if !buf.is_empty() {
        spans.push(Span::styled(buf, current_style));
    }

    if spans.is_empty() {
        Line::from("")
    } else {
        Line::from(spans)
    }
}

fn apply_sgr(params: &str, base: Style) -> Style {
    if params.is_empty() {
        return Style::default();
    }

    let mut style = base;
    let codes: Vec<u8> = params
        .split(';')
        .filter_map(|p| p.parse::<u8>().ok())
        .collect();

    let mut i = 0;
    while i < codes.len() {
        match codes[i] {
            0 => style = Style::default(),
            1 => style = style.add_modifier(Modifier::BOLD),
            2 => style = style.add_modifier(Modifier::DIM),
            3 => style = style.add_modifier(Modifier::ITALIC),
            4 => style = style.add_modifier(Modifier::UNDERLINED),
            7 => style = style.add_modifier(Modifier::REVERSED),
            22 => style = style.remove_modifier(Modifier::BOLD | Modifier::DIM),
            23 => style = style.remove_modifier(Modifier::ITALIC),
            24 => style = style.remove_modifier(Modifier::UNDERLINED),
            27 => style = style.remove_modifier(Modifier::REVERSED),
            // Foreground colors
            30 => style = style.fg(Color::Black),
            31 => style = style.fg(Color::Red),
            32 => style = style.fg(Color::Green),
            33 => style = style.fg(Color::Yellow),
            34 => style = style.fg(Color::Blue),
            35 => style = style.fg(Color::Magenta),
            36 => style = style.fg(Color::Cyan),
            37 => style = style.fg(Color::White),
            38 => {
                // Extended foreground: 38;5;N or 38;2;R;G;B
                if i + 1 < codes.len() && codes[i + 1] == 5 {
                    if i + 2 < codes.len() {
                        style = style.fg(Color::Indexed(codes[i + 2]));
                        i += 2;
                    }
                } else if i + 1 < codes.len() && codes[i + 1] == 2 && i + 4 < codes.len() {
                    style = style.fg(Color::Rgb(codes[i + 2], codes[i + 3], codes[i + 4]));
                    i += 4;
                }
            }
            39 => style = style.fg(Color::Reset),
            // Background colors
            40 => style = style.bg(Color::Black),
            41 => style = style.bg(Color::Red),
            42 => style = style.bg(Color::Green),
            43 => style = style.bg(Color::Yellow),
            44 => style = style.bg(Color::Blue),
            45 => style = style.bg(Color::Magenta),
            46 => style = style.bg(Color::Cyan),
            47 => style = style.bg(Color::White),
            48 => {
                // Extended background: 48;5;N or 48;2;R;G;B
                if i + 1 < codes.len() && codes[i + 1] == 5 {
                    if i + 2 < codes.len() {
                        style = style.bg(Color::Indexed(codes[i + 2]));
                        i += 2;
                    }
                } else if i + 1 < codes.len() && codes[i + 1] == 2 && i + 4 < codes.len() {
                    style = style.bg(Color::Rgb(codes[i + 2], codes[i + 3], codes[i + 4]));
                    i += 4;
                }
            }
            49 => style = style.bg(Color::Reset),
            // Bright foreground
            90 => style = style.fg(Color::DarkGray),
            91 => style = style.fg(Color::LightRed),
            92 => style = style.fg(Color::LightGreen),
            93 => style = style.fg(Color::LightYellow),
            94 => style = style.fg(Color::LightBlue),
            95 => style = style.fg(Color::LightMagenta),
            96 => style = style.fg(Color::LightCyan),
            97 => style = style.fg(Color::White),
            // Bright background
            100 => style = style.bg(Color::DarkGray),
            101 => style = style.bg(Color::LightRed),
            102 => style = style.bg(Color::LightGreen),
            103 => style = style.bg(Color::LightYellow),
            104 => style = style.bg(Color::LightBlue),
            105 => style = style.bg(Color::LightMagenta),
            106 => style = style.bg(Color::LightCyan),
            107 => style = style.bg(Color::White),
            _ => {}
        }
        i += 1;
    }

    style
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_sgr_reset() {
        let styled = Style::default().fg(Color::Red);
        let result = apply_sgr("0", styled);
        assert_eq!(result, Style::default());
    }

    #[test]
    fn apply_sgr_empty_resets() {
        let styled = Style::default().fg(Color::Red);
        let result = apply_sgr("", styled);
        assert_eq!(result, Style::default());
    }

    #[test]
    fn apply_sgr_bold() {
        let result = apply_sgr("1", Style::default());
        assert!(result.add_modifier == Modifier::BOLD);
    }

    #[test]
    fn apply_sgr_foreground_colors() {
        assert_eq!(apply_sgr("31", Style::default()).fg, Some(Color::Red));
        assert_eq!(apply_sgr("32", Style::default()).fg, Some(Color::Green));
        assert_eq!(apply_sgr("33", Style::default()).fg, Some(Color::Yellow));
        assert_eq!(apply_sgr("34", Style::default()).fg, Some(Color::Blue));
    }

    #[test]
    fn apply_sgr_background_colors() {
        assert_eq!(apply_sgr("41", Style::default()).bg, Some(Color::Red));
        assert_eq!(apply_sgr("42", Style::default()).bg, Some(Color::Green));
    }

    #[test]
    fn apply_sgr_256_color() {
        let result = apply_sgr("38;5;100", Style::default());
        assert_eq!(result.fg, Some(Color::Indexed(100)));
    }

    #[test]
    fn apply_sgr_rgb_color() {
        let result = apply_sgr("38;2;255;128;0", Style::default());
        assert_eq!(result.fg, Some(Color::Rgb(255, 128, 0)));
    }

    #[test]
    fn apply_sgr_bg_256_color() {
        let result = apply_sgr("48;5;200", Style::default());
        assert_eq!(result.bg, Some(Color::Indexed(200)));
    }

    #[test]
    fn apply_sgr_bg_rgb_color() {
        let result = apply_sgr("48;2;10;20;30", Style::default());
        assert_eq!(result.bg, Some(Color::Rgb(10, 20, 30)));
    }

    #[test]
    fn apply_sgr_combined() {
        let result = apply_sgr("1;31", Style::default());
        assert_eq!(result.fg, Some(Color::Red));
        assert!(result.add_modifier == Modifier::BOLD);
    }

    #[test]
    fn apply_sgr_bright_foreground() {
        assert_eq!(apply_sgr("90", Style::default()).fg, Some(Color::DarkGray));
        assert_eq!(apply_sgr("91", Style::default()).fg, Some(Color::LightRed));
    }

    #[test]
    fn apply_sgr_remove_bold() {
        let bold = apply_sgr("1", Style::default());
        let result = apply_sgr("22", bold);
        assert!(result.add_modifier == Modifier::empty());
    }

    #[test]
    fn parse_ansi_line_plain_text() {
        let line = parse_ansi_line("hello world");
        assert_eq!(line.spans.len(), 1);
        assert_eq!(line.spans[0].content, "hello world");
    }

    #[test]
    fn parse_ansi_line_with_color() {
        let line = parse_ansi_line("\x1b[31mred\x1b[0m normal");
        assert_eq!(line.spans.len(), 2);
        assert_eq!(line.spans[0].content, "red");
        assert_eq!(line.spans[0].style.fg, Some(Color::Red));
        assert_eq!(line.spans[1].content, " normal");
    }

    #[test]
    fn parse_ansi_line_empty() {
        let line = parse_ansi_line("");
        assert_eq!(line, Line::from(""));
    }

    #[test]
    fn parse_ansi_line_only_escape() {
        let line = parse_ansi_line("\x1b[0m");
        assert_eq!(line, Line::from(""));
    }
}
