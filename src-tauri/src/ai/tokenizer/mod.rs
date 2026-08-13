pub trait Tokenizer: Send + Sync {
    fn tokenize(&self, text: &str) -> Vec<String>;
    fn detokenize(&self, tokens: &[String]) -> String;
}

pub struct WhitespaceTokenizer;
impl Tokenizer for WhitespaceTokenizer {
    fn tokenize(&self, text: &str) -> Vec<String> {
        text.split_whitespace().map(|s| s.to_string()).collect()
    }
    fn detokenize(&self, tokens: &[String]) -> String {
        tokens.join(" ")
    }
}
