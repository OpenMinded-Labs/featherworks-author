use serde::{Serialize,Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportProject { pub id:String, pub title:String, pub author:String }

pub fn export_docx(_project:&ExportProject,_path:&str)->Result<(),Box<dyn std::error::Error>>{Ok(())}
