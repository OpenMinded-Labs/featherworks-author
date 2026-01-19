use regex::{RegexSet, Regex};
use once_cell::sync::Lazy;use std::sync::RwLock;

#[derive(Clone, Debug)]
pub struct EntityPattern {
    pub id: String,
    #[allow(dead_code)]
    pub name: String,
    pub regex: String,
}

#[derive(Clone, Debug)]
pub struct EntityHit { pub id: String, pub start: usize, pub end: usize, pub text: String }

static ENTITY_PATTERNS: Lazy<RwLock<Vec<EntityPattern>>> = Lazy::new(|| RwLock::new(vec![]));
static ENTITY_SET: Lazy<RwLock<Option<RegexSet>>> = Lazy::new(|| RwLock::new(None));

pub fn configure_entities(named: &[(String,String)]) { // (id,name)
    {
        // scope to ensure write lock is dropped before rebuild() acquires a read lock
        let mut patterns = ENTITY_PATTERNS.write().unwrap();
        patterns.clear();
        for (id,name) in named {
            let rx = format!(r"(?i)\b{}\b", regex::escape(name));
            patterns.push(EntityPattern { id: id.clone(), name: name.clone(), regex: rx });
        }
    }
    rebuild();
}

fn rebuild() { if let Ok(pats)=ENTITY_PATTERNS.read() { if let Ok(mut set)=ENTITY_SET.write() { *set = RegexSet::new(pats.iter().map(|p| p.regex.as_str())).ok(); } } }

pub fn scan(text:&str)->Vec<EntityHit>{
    let set_opt = ENTITY_SET.read().unwrap();
    let patterns = ENTITY_PATTERNS.read().unwrap();
    let mut hits = Vec::new();
    if let Some(set)=&*set_opt {
        for idx in set.matches(text).into_iter() { if let Some(p)=patterns.get(idx) {
            if let Ok(rx) = Regex::new(&p.regex) {
                for m in rx.find_iter(text) { hits.push(EntityHit { id: p.id.clone(), start: m.start(), end: m.end(), text: m.as_str().to_string() }); }
            }
        }}
    }
    hits
}
