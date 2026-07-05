/// AI-generated tags that are too broad/noisy to be useful in this gallery.
/// Edit this list to change what the tagger removes. Manual user tags are not
/// affected.
pub const AI_TAG_REMOVAL_LIST: &[&str] = &["1girl", "1boy", "no humans", "2girls", "2boys"];

fn normalize_tag_for_removal(tag: &str) -> String {
    tag.trim()
        .chars()
        .filter(|c| !matches!(c, ' ' | '_' | '-'))
        .flat_map(char::to_lowercase)
        .collect()
}

pub fn is_removed_ai_tag(tag: &str) -> bool {
    let normalized = normalize_tag_for_removal(tag);
    AI_TAG_REMOVAL_LIST
        .iter()
        .any(|blocked| normalize_tag_for_removal(blocked) == normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removed_ai_tags_match_common_spellings() {
        for tag in [
            "1girl",
            "1 girl",
            "1_girl",
            "1-girl",
            "NO_HUMANS",
            "no humans",
        ] {
            assert!(is_removed_ai_tag(tag), "{tag} should be removed");
        }
    }

    #[test]
    fn removed_ai_tags_do_not_match_unrelated_tags() {
        for tag in ["girl", "boy", "humans", "solo", "landscape"] {
            assert!(!is_removed_ai_tag(tag), "{tag} should be kept");
        }
    }

    #[test]
    fn removed_ai_tags_tolerate_padding_and_mixed_separators() {
        assert!(is_removed_ai_tag("  1girl  "));
        assert!(is_removed_ai_tag("1_-_girl"));
        assert!(is_removed_ai_tag("No Humans"));
        assert!(!is_removed_ai_tag(""));
        assert!(!is_removed_ai_tag("   "));
    }
}
