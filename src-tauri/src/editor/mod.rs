#[derive(Default)]
pub struct EditorState {
    current_text: String,
}
impl EditorState {
    pub fn update_content(&mut self, content: &str) { self.current_text = content.to_string(); }
}
