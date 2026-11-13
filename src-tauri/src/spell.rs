//! Spellchecking in Rust (Hunspell dictionaries through `spellbook`). The webview used to
//! parse a 550 KB dictionary in JavaScript on its only thread, which froze typing for about
//! half a second the first time a page opened. Here the dictionary is parsed on a
//! background thread while Lumen starts, and every check runs off the UI thread.

use std::collections::HashSet;
use std::sync::{OnceLock, RwLock};

use spellbook::Dictionary;

static EN_GB: OnceLock<Dictionary> = OnceLock::new();
static EN_US: OnceLock<Dictionary> = OnceLock::new();
/// The person's own words (synced with their account by the webview).
static PERSONAL: RwLock<Option<HashSet<String>>> = RwLock::new(None);

fn dictionary(variant: &str) -> &'static Dictionary {
    if variant == "en-US" {
        EN_US.get_or_init(|| {
            Dictionary::new(include_str!("../dictionaries/en-us.aff"), include_str!("../dictionaries/en-us.dic"))
                .expect("the bundled en-US dictionary parses")
        })
    } else {
        EN_GB.get_or_init(|| {
            Dictionary::new(include_str!("../dictionaries/en-gb.aff"), include_str!("../dictionaries/en-gb.dic"))
                .expect("the bundled en-GB dictionary parses")
        })
    }
}

/// Curly apostrophes are typed far more often than the dictionary has them.
fn normal(word: &str) -> String {
    word.replace('\u{2019}', "'")
}

/// Words not worth checking: one letter, or anything with digits or underscores.
fn checkable(word: &str) -> bool {
    word.chars().count() > 1 && !word.chars().any(|c| c.is_ascii_digit() || c == '_')
}

fn known(dict: &Dictionary, personal: Option<&HashSet<String>>, word: &str) -> bool {
    personal.is_some_and(|p| p.contains(word) || p.contains(&word.to_lowercase())) || dict.check(word)
}

fn correct(dict: &Dictionary, personal: Option<&HashSet<String>>, word: &str) -> bool {
    let word = normal(word);
    known(dict, personal, &word)
        || (word.contains('-') && word.split('-').all(|part| part.is_empty() || known(dict, personal, part)))
}

/// Parses the dictionary ahead of the first check. Returns at once.
#[tauri::command]
pub fn spell_warm(variant: String) {
    std::thread::spawn(move || {
        dictionary(&variant);
    });
}

/// The subset of `words` that are misspelled.
#[tauri::command(async)]
pub fn spell_check(variant: String, words: Vec<String>) -> Vec<String> {
    let dict = dictionary(&variant);
    let personal = PERSONAL.read().ok();
    let personal = personal.as_ref().and_then(|p| p.as_ref());
    words
        .into_iter()
        .filter(|w| checkable(w) && !correct(dict, personal, w))
        .collect()
}

/// Up to `max` corrections, best first.
#[tauri::command(async)]
pub fn spell_suggest(variant: String, word: String, max: usize) -> Vec<String> {
    let mut out = Vec::new();
    dictionary(&variant).suggest(&normal(&word), &mut out);
    out.truncate(max);
    out
}

/// Replaces the person's own words.
#[tauri::command]
pub fn spell_personal(words: Vec<String>) {
    let set: HashSet<String> = words.iter().map(|w| normal(w)).collect();
    if let Ok(mut personal) = PERSONAL.write() {
        *personal = Some(set);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_both_spellings() {
        let gb = dictionary("en-GB");
        let us = dictionary("en-US");
        assert!(correct(gb, None, "colour"));
        assert!(!correct(us, None, "colour"));
        assert!(correct(us, None, "color"));
        assert!(correct(gb, None, "Hello"));
        assert!(!correct(gb, None, "helo"));
    }

    #[test]
    fn apostrophes_hyphens_and_personal_words() {
        let gb = dictionary("en-GB");
        assert!(correct(gb, None, "don\u{2019}t"));
        assert!(correct(gb, None, "well-known"));
        assert!(!correct(gb, None, "well-knwon"));
        let mine: HashSet<String> = ["Lumen".to_string(), "niftyish".to_string()].into();
        assert!(!correct(gb, None, "niftyish"));
        assert!(correct(gb, Some(&mine), "niftyish"));
        assert!(correct(gb, Some(&mine), "Lumen"));
        assert!(!checkable("a"));
        assert!(!checkable("v2"));
    }

    #[test]
    fn suggests() {
        let mut out = Vec::new();
        dictionary("en-GB").suggest("helo", &mut out);
        assert!(out.iter().any(|s| s == "hello" || s == "help" || s == "held"), "{out:?}");
    }
}
