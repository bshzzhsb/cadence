use chrono::{Datelike, Duration, Local, NaiveDate, TimeZone, Timelike, Utc, Weekday};
use regex::Regex;

use crate::models::TaskDraft;

pub fn parse_task(raw: &str, default_hour: u8, source_excerpt: Option<String>) -> TaskDraft {
    let tag_re = Regex::new(r"#([^\s#]+)").expect("tag regex");
    let tags = tag_re
        .captures_iter(raw)
        .map(|capture| capture[1].to_string())
        .collect::<Vec<_>>();
    let priority = if raw.contains("!高") {
        "high"
    } else if raw.contains("!低") {
        "low"
    } else {
        "normal"
    };
    let mut title = tag_re
        .replace_all(raw, "")
        .replace("!高", "")
        .replace("!中", "")
        .replace("!低", "");
    let now = Local::now();
    let mut target_date = None;

    let iso_re = Regex::new(r"(?P<y>20\d{2})[-/.年](?P<m>\d{1,2})[-/.月](?P<d>\d{1,2})日?")
        .expect("date regex");
    if let Some(capture) = iso_re.captures(&title) {
        target_date = NaiveDate::from_ymd_opt(
            capture["y"].parse().unwrap_or(now.year()),
            capture["m"].parse().unwrap_or(1),
            capture["d"].parse().unwrap_or(1),
        );
        title = iso_re.replace(&title, "").into_owned();
    } else if title.contains("后天") {
        target_date = Some((now + Duration::days(2)).date_naive());
        title = title.replace("后天", "");
    } else if title.contains("明天") {
        target_date = Some((now + Duration::days(1)).date_naive());
        title = title.replace("明天", "");
    } else if title.contains("今天") {
        target_date = Some(now.date_naive());
        title = title.replace("今天", "");
    }

    let weekday_re =
        Regex::new(r"(?P<next>下)?周(?P<day>[一二三四五六日天])").expect("weekday regex");
    if target_date.is_none() {
        if let Some(capture) = weekday_re.captures(&title) {
            let wanted = match &capture["day"] {
                "一" => Weekday::Mon,
                "二" => Weekday::Tue,
                "三" => Weekday::Wed,
                "四" => Weekday::Thu,
                "五" => Weekday::Fri,
                "六" => Weekday::Sat,
                _ => Weekday::Sun,
            };
            let current = now.weekday().num_days_from_monday() as i64;
            let desired = wanted.num_days_from_monday() as i64;
            let mut days = (desired - current + 7) % 7;
            if days == 0 {
                days = 7;
            }
            if capture.name("next").is_some() {
                days += 7;
            }
            target_date = Some((now + Duration::days(days)).date_naive());
            title = weekday_re.replace(&title, "").into_owned();
        }
    }

    let time_re = Regex::new(r"(?:(?P<period>上午|中午|下午|晚上)\s*)?(?P<h>\d{1,2})(?:(?:[:：]|点)(?P<min>\d{1,2})?分?)").expect("time regex");
    let mut hour = default_hour as u32;
    let mut minute = 0u32;
    if let Some(capture) = time_re.captures(&title) {
        hour = capture["h"].parse().unwrap_or(default_hour as u32).min(23);
        minute = capture
            .name("min")
            .and_then(|value| value.as_str().parse().ok())
            .unwrap_or(0)
            .min(59);
        if matches!(
            capture.name("period").map(|value| value.as_str()),
            Some("下午" | "晚上")
        ) && hour < 12
        {
            hour += 12;
        }
        if capture.name("period").map(|value| value.as_str()) == Some("中午") && hour < 11 {
            hour += 12;
        }
        title = time_re.replace(&title, "").into_owned();
        if target_date.is_none() {
            target_date = Some(
                if hour < now.hour() || (hour == now.hour() && minute <= now.minute()) {
                    (now + Duration::days(1)).date_naive()
                } else {
                    now.date_naive()
                },
            );
        }
    }

    let due_at = target_date
        .and_then(|date| date.and_hms_opt(hour, minute, 0))
        .and_then(|naive| Local.from_local_datetime(&naive).single())
        .map(|date| date.with_timezone(&Utc).to_rfc3339());
    let cleaned = title.split_whitespace().collect::<Vec<_>>().join(" ");
    TaskDraft {
        title: if cleaned.is_empty() {
            raw.trim().to_string()
        } else {
            cleaned
        },
        notes: None,
        due_at,
        timezone: "local".into(),
        priority: priority.into(),
        tags,
        source_excerpt,
        confidence: 1.0,
        uncertain_fields: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn extracts_tags_and_priority() {
        let draft = parse_task("明天 18:30 交方案 #工作 !高", 18, None);
        assert_eq!(draft.title, "交方案");
        assert_eq!(draft.tags, vec!["工作"]);
        assert_eq!(draft.priority, "high");
        assert!(draft.due_at.is_some());
    }
}
