use rusqlite::{Connection, Result};
use rusqlite::OptionalExtension;
use crate::types::{Project,Chapter,Character,WritingStats,Scene,EditorSettings};

pub struct ProjectDatabase { pub(crate) conn: Connection }
impl ProjectDatabase {
    pub fn new(path: &str) -> Result<Self> { let conn = Connection::open(path)?; Self::migrate(&conn)?; Ok(ProjectDatabase { conn }) }
    pub fn open(path: &str) -> Result<Self> { let conn = Connection::open(path)?; Self::migrate(&conn)?; Ok(ProjectDatabase { conn }) }
    fn migrate(conn: &Connection) -> Result<()> {
    // Ensure durable settings
    let _ = conn.pragma_update(None, "journal_mode", &"WAL");
    let _ = conn.pragma_update(None, "synchronous", &"FULL");
    conn.execute("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT, short_name TEXT, genre TEXT, target_page_count INTEGER, created_at TEXT, modified_at TEXT, metadata TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS recent_projects (path TEXT PRIMARY KEY, title TEXT, short_name TEXT, last_opened TEXT)", [])?;
        conn.execute("CREATE TABLE IF NOT EXISTS chapters (id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL, content TEXT, order_index INTEGER, word_count INTEGER, FOREIGN KEY (project_id) REFERENCES projects(id))", [])?;
        conn.execute("CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, project_id TEXT, name TEXT NOT NULL, role TEXT, description TEXT, notes TEXT, color TEXT, FOREIGN KEY (project_id) REFERENCES projects(id))", [])?;
        conn.execute("CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, project_id TEXT, name TEXT NOT NULL, kind TEXT, aliases TEXT, FOREIGN KEY (project_id) REFERENCES projects(id))", [])?;
        conn.execute("CREATE TABLE IF NOT EXISTS entity_occurrences (id TEXT PRIMARY KEY, entity_id TEXT, chapter_id TEXT, position INTEGER, length INTEGER, FOREIGN KEY(entity_id) REFERENCES entities(id), FOREIGN KEY(chapter_id) REFERENCES chapters(id))", [])?;
        conn.execute("CREATE TABLE IF NOT EXISTS chapter_snapshots (id TEXT PRIMARY KEY, chapter_id TEXT, created_at TEXT, content BLOB, FOREIGN KEY(chapter_id) REFERENCES chapters(id))", [])?;
        conn.execute("CREATE TABLE IF NOT EXISTS scenes (id TEXT PRIMARY KEY, chapter_id TEXT NOT NULL, title TEXT, content TEXT, order_index INTEGER, status TEXT, notes TEXT, word_count INTEGER, FOREIGN KEY(chapter_id) REFERENCES chapters(id))", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS editor_settings (id INTEGER PRIMARY KEY CHECK (id=1), font_family TEXT, font_size INTEGER, line_height REAL, page_width INTEGER, theme TEXT, show_line_numbers INTEGER, synonyms_enabled INTEGER DEFAULT 1, focus_mode_default INTEGER DEFAULT 0)", [])?;
        conn.execute("CREATE TABLE IF NOT EXISTS app_settings (id INTEGER PRIMARY KEY CHECK (id=1), autosave_interval_ms INTEGER, language TEXT, default_project_location TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS license_state (id INTEGER PRIMARY KEY CHECK (id=1), token TEXT, edition TEXT NOT NULL, expires INTEGER, features TEXT)", [])?;
        // Ensure single row exists
    conn.execute("INSERT OR IGNORE INTO editor_settings (id,font_family,font_size,line_height,page_width,theme,show_line_numbers,synonyms_enabled,focus_mode_default) VALUES (1,'Georgia',16,1.5,900,'dark',0,1,0)", [])?;
        conn.execute("INSERT OR IGNORE INTO app_settings (id,autosave_interval_ms,language,default_project_location) VALUES (1,5000,'de','')", [])?;
        conn.execute("INSERT OR IGNORE INTO license_state (id, token, edition, expires, features) VALUES (1,NULL,'core',NULL,'{}')", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_scenes_chapter ON scenes(chapter_id)", [])?;
        
        // --- Data migrations for legacy databases ---
        // 1) Backfill missing chapter.project_id for old files created before project IDs were enforced
        let maybe_project_id: Option<String> = conn
            .query_row("SELECT id FROM projects LIMIT 1", [], |r| r.get(0))
            .optional()?;
        if let Some(pid) = maybe_project_id {
            // If there are chapters with NULL/empty or mismatching project_id, assign current project id
            conn.execute(
                "UPDATE chapters SET project_id=?1 WHERE project_id IS NULL OR project_id='' OR project_id<>?1",
                [&pid],
            )?;
        }
        // 2) Normalize NULLs for order_index/word_count columns
        conn.execute(
            "UPDATE chapters SET word_count=COALESCE(word_count,0)",
            [],
        )?;
        conn.execute(
            "UPDATE chapters SET order_index=COALESCE(order_index,0)",
            [],
        )?;
        conn.execute(
            "UPDATE scenes SET word_count=COALESCE(word_count,0)",
            [],
        )?;
        conn.execute(
            "UPDATE scenes SET order_index=COALESCE(order_index,0)",
            [],
        )?;
        Ok(())
    }
    pub fn create_project(&self, project: &Project) -> Result<()> {
        let tpc: Option<i64> = project.target_page_count.map(|v| v as i64);
        self.conn.execute(
            "INSERT INTO projects (id, title, author, short_name, genre, target_page_count, created_at, modified_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                project.id,
                project.title,
                project.author,
                project.short_name.as_deref(),
                project.genre.as_deref(),
                tpc,
                project.created_at,
                project.modified_at
            ])?;
        Ok(())
    }
    pub fn get_project(&self) -> Result<Project> { let mut stmt = self.conn.prepare("SELECT id, title, author, short_name, genre, target_page_count, created_at, modified_at FROM projects LIMIT 1")?; let project = stmt.query_row([], |row| { let tpc: Option<i64> = row.get(5)?; Ok(Project { id: row.get(0)?, title: row.get(1)?, author: row.get(2)?, short_name: row.get(3)?, genre: row.get(4)?, target_page_count: tpc.map(|v| v as u32), created_at: row.get(6)?, modified_at: row.get(7)?, word_count: 0, chapters: vec![] }) })?; Ok(project) }
    pub fn update_project_metadata(&self, id:&str, title:&str, author:&str, short_name:Option<&str>, genre:Option<&str>, target_page_count:Option<u32>) -> Result<()> {
        self.conn.execute("UPDATE projects SET title=?2, author=?3, short_name=?4, genre=?5, target_page_count=?6, modified_at=?7 WHERE id=?1",
            rusqlite::params![id, title, author, short_name, genre, target_page_count.map(|v| v as i64), chrono::Utc::now().to_rfc3339()])?; Ok(())
    }
    #[allow(dead_code)]
    pub fn touch_project(&self, id:&str) -> Result<()> { self.conn.execute("UPDATE projects SET modified_at=?2 WHERE id=?1", rusqlite::params![id, chrono::Utc::now().to_rfc3339()])?; Ok(()) }
    #[allow(dead_code)]
    pub fn record_recent_project(&self, path:&str, title:&str, short_name:Option<&str>) -> Result<()> {
        self.conn.execute("INSERT OR REPLACE INTO recent_projects (path,title,short_name,last_opened) VALUES (?1,?2,?3,?4)", rusqlite::params![path, title, short_name, chrono::Utc::now().to_rfc3339()])?; Ok(())
    }
    #[allow(dead_code)]
    pub fn list_recent_projects(&self, limit:u32) -> Result<Vec<(String,String,Option<String>,String)>> {
        let mut stmt = self.conn.prepare("SELECT path,title,short_name,last_opened FROM recent_projects ORDER BY last_opened DESC LIMIT ?1")?;
        let rows = stmt.query_map([limit], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
        let mut out=Vec::new(); for r in rows { out.push(r?); } Ok(out)
    }
    pub fn save_chapter(&self, chapter: &Chapter) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO chapters (id, project_id, title, content, order_index, word_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                &chapter.id,
                &chapter.project_id,
                &chapter.title,
                &chapter.content,
                chapter.order as i64,
                chapter.word_count as i64
            ]
        )?; Ok(())
    }
    pub fn list_chapters(&self, project_id:&str) -> Result<Vec<Chapter>> {
        let mut stmt = self.conn.prepare("SELECT id, project_id, title, content, order_index, word_count FROM chapters WHERE project_id=?1 ORDER BY order_index ASC")?;
        let rows = stmt.query_map([project_id], |row| {
            let order: i64 = row.get(4)?; let wc: i64 = row.get(5)?;
            Ok(Chapter { project_id: row.get(1)?, id: row.get(0)?, title: row.get(2)?, content: row.get(3)?, order: order as u32, word_count: wc as u32 })
        })?;
        let mut out = Vec::new(); for r in rows { out.push(r?); } Ok(out)
    }
    pub fn next_chapter_order(&self, project_id:&str) -> Result<u32> {
        let v: i64 = self.conn.query_row("SELECT COALESCE(MAX(order_index), -1) + 1 FROM chapters WHERE project_id=?1", [project_id], |r| r.get(0))?; Ok(v as u32)
    }
    pub fn update_chapter_title(&self, chapter_id:&str, title:&str) -> Result<()> {
        self.conn.execute("UPDATE chapters SET title=?2 WHERE id=?1", [chapter_id, title])?; Ok(())
    }
    pub fn delete_chapter(&self, chapter_id:&str) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("DELETE FROM scenes WHERE chapter_id=?1", [chapter_id])?;
        tx.execute("DELETE FROM entity_occurrences WHERE chapter_id=?1", [chapter_id])?;
        tx.execute("DELETE FROM chapter_snapshots WHERE chapter_id=?1", [chapter_id])?;
        tx.execute("DELETE FROM chapters WHERE id=?1", [chapter_id])?;
        tx.commit()?; Ok(())
    }
    pub fn reorder_chapters(&self, project_id:&str, ordered_ids:&[String]) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        for (idx,id) in ordered_ids.iter().enumerate() {
            tx.execute(
                "UPDATE chapters SET order_index=?2 WHERE id=?1 AND project_id=?3",
                rusqlite::params![id, idx as i64, project_id]
            )?;
        }
        tx.commit()?; Ok(())
    }
    pub fn add_character(&self, character: &Character) -> Result<()> { self.conn.execute("INSERT INTO characters (id, name, role, description, notes, color) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", &[&character.id, &character.name, &character.role, &character.description, &character.notes, &character.color])?; Ok(()) }
    pub fn get_all_characters(&self) -> Result<Vec<Character>> { let mut stmt = self.conn.prepare("SELECT id, name, role, description, notes, color FROM characters")?; let characters = stmt.query_map([], |row| { Ok(Character { id: row.get(0)?, name: row.get(1)?, role: row.get(2)?, description: row.get(3)?, notes: row.get(4)?, color: row.get(5)?, }) })?; characters.collect() }
    pub fn get_statistics(&self) -> Result<WritingStats> { let chapter_count: u32 = self.conn.query_row("SELECT COUNT(*) FROM chapters", [], |row| row.get(0))?; let character_count: u32 = self.conn.query_row("SELECT COUNT(*) FROM characters", [], |row| row.get(0))?; let total_words: u32 = self.conn.query_row("SELECT COALESCE(SUM(word_count), 0) FROM chapters", [], |row| row.get(0))?; Ok(WritingStats { total_words, chapters: chapter_count, characters: character_count, writing_time: 0 }) }

    pub fn get_chapter(&self, id:&str) -> Result<Chapter> {
        let mut stmt = self.conn.prepare("SELECT id,title,content,order_index,word_count,project_id FROM chapters WHERE id=?1 LIMIT 1")?;
        let chapter = stmt.query_row([id], |row| {
            let order: i64 = row.get(3)?; let wc: i64 = row.get(4)?; let pid: Option<String> = row.get(5).ok();
            Ok(Chapter { project_id: pid.unwrap_or_else(|| "project-single".into()), id: row.get(0)?, title: row.get(1)?, content: row.get(2)?, order: order as u32, word_count: wc as u32 })
        })?;
        Ok(chapter)
    }

    // ========== Entities API (M0 draft) ==========
    pub fn upsert_entity(&self, id:&str, project_id:&str, name:&str, kind:&str, aliases_json:&str) -> Result<()> {
        self.conn.execute("INSERT OR REPLACE INTO entities (id, project_id, name, kind, aliases) VALUES (?1, ?2, ?3, ?4, ?5)", [id, project_id, name, kind, aliases_json])?; Ok(())
    }
    pub fn list_entities(&self, project_id:&str) -> Result<Vec<(String,String,String,String)>> {
        let mut stmt = self.conn.prepare("SELECT id,name,kind,aliases FROM entities WHERE project_id=?1")?;
        let rows = stmt.query_map([project_id], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?)))?;
        rows.collect()
    }
    pub fn insert_occurrence(&self, id:&str, entity_id:&str, chapter_id:&str, pos:i64, len:i64) -> Result<()> {
        self.conn.execute(
            "INSERT INTO entity_occurrences (id,entity_id,chapter_id,position,length) VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![id, entity_id, chapter_id, pos, len]
        )?; Ok(())
    }
    pub fn delete_occurrences_for_chapter(&self, chapter_id:&str) -> Result<()> {
        self.conn.execute("DELETE FROM entity_occurrences WHERE chapter_id=?1", [chapter_id])?; Ok(())
    }

    // ========== Snapshots ==========
    pub fn create_snapshot(&self, snapshot_id:&str, chapter_id:&str) -> Result<()> {
        // fetch current chapter content
        let content:String = self.conn.query_row("SELECT content FROM chapters WHERE id=?1", [chapter_id], |r| r.get(0))?;
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute("INSERT INTO chapter_snapshots (id, chapter_id, created_at, content) VALUES (?1,?2,?3,?4)", [snapshot_id, chapter_id, &now, &content])?; Ok(())
    }
    pub fn list_snapshots(&self, chapter_id:&str) -> Result<Vec<(String,String,String,Vec<u8>)>> {
        let mut stmt = self.conn.prepare("SELECT id,chapter_id,created_at,content FROM chapter_snapshots WHERE chapter_id=?1 ORDER BY created_at DESC")?;
        let rows = stmt.query_map([chapter_id], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get::<_,Vec<u8>>(3)? )))?;
        rows.collect()
    }
    pub fn get_snapshot_content(&self, snapshot_id:&str) -> Result<String> {
        self.conn.query_row("SELECT content FROM chapter_snapshots WHERE id=?1", [snapshot_id], |row| { let data:Vec<u8>=row.get(0)?; String::from_utf8(data).map_err(|e| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Blob, Box::new(e))) })
    }

    // ========== Scenes ==========
    pub fn create_scene(&self, scene:&Scene) -> Result<()> {
        self.conn.execute(
            "INSERT INTO scenes (id,chapter_id,title,content,order_index,status,notes,word_count) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            rusqlite::params![
                &scene.id,
                &scene.chapter_id,
                &scene.title,
                &scene.content,
                scene.order as i64,
                &scene.status,
                &scene.notes,
                scene.word_count as i64
            ]
        )?; Ok(())
    }
    pub fn update_scene_content(&self, id:&str, content:&str, word_count:u32) -> Result<()> {
        self.conn.execute(
            "UPDATE scenes SET content=?2, word_count=?3 WHERE id=?1",
            rusqlite::params![id, content, word_count as i64]
        )?; Ok(())
    }
    pub fn update_scene_status(&self, id:&str, status:&str) -> Result<()> {
        self.conn.execute("UPDATE scenes SET status=?2 WHERE id=?1", [id, status])?; Ok(())
    }
    pub fn update_scene_title(&self, id:&str, title:&str) -> Result<()> {
        self.conn.execute("UPDATE scenes SET title=?2 WHERE id=?1", [id, title])?; Ok(())
    }
    pub fn delete_scene(&self, id:&str) -> Result<()> {
        // Need chapter id for later aggregation
        let chapter_id: String = match self.conn.query_row("SELECT chapter_id FROM scenes WHERE id=?1", [id], |r| r.get(0)) { Ok(v)=>v, Err(_)=>return Ok(()) };
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("DELETE FROM scenes WHERE id=?1", [id])?;
        // Re-pack order indices
        {
            let mut stmt = tx.prepare("SELECT id FROM scenes WHERE chapter_id=?1 ORDER BY order_index ASC")?;
            let rows = stmt.query_map([&chapter_id], |r| r.get::<_,String>(0))?;
            for (idx,row) in rows.enumerate(){ let sid=row?; tx.execute("UPDATE scenes SET order_index=?2 WHERE id=?1", rusqlite::params![&sid, idx as i64])?; }
        }
        tx.commit()?;
        let _ = self.aggregate_chapter_word_count(&chapter_id);
        Ok(())
    }
    pub fn get_scene_content(&self, id:&str) -> Result<(String,u32)> {
        self.conn.query_row("SELECT content, word_count FROM scenes WHERE id=?1", [id], |r| {
            let c:String = r.get(0)?; let wc:i64 = r.get(1)?; Ok((c, wc as u32))
        })
    }
    pub fn aggregate_chapter_word_count(&self, chapter_id:&str) -> Result<u32> {
        // Try fetch chapter content; if not found treat as empty
        let chapter_content_res: Result<String> = self.conn.query_row(
            "SELECT content FROM chapters WHERE id=?1", [chapter_id], |r| r.get(0));
        let base_wc = match chapter_content_res { Ok(c) => c, Err(_) => String::new() }
            .split_whitespace()
            .filter(|w| !w.is_empty())
            .count() as u32;
        let scenes_sum: i64 = self.conn.query_row(
            "SELECT COALESCE(SUM(word_count),0) FROM scenes WHERE chapter_id=?1",
            [chapter_id], |r| r.get(0))?;
        let total = base_wc + scenes_sum as u32;
        self.conn.execute(
            "UPDATE chapters SET word_count=?2 WHERE id=?1",
            rusqlite::params![chapter_id, total as i64]
        )?;
        Ok(total)
    }
    pub fn list_scenes(&self, chapter_id:&str) -> Result<Vec<Scene>> {
        let mut stmt = self.conn.prepare("SELECT id,chapter_id,title,content,order_index,status,notes,word_count FROM scenes WHERE chapter_id=?1 ORDER BY order_index ASC")?;
        let rows = stmt.query_map([chapter_id], |r| Ok(Scene { id:r.get(0)?, chapter_id:r.get(1)?, title:r.get(2)?, content:r.get(3)?, order: { let v:i64=r.get(4)?; v as u32 }, status:r.get(5)?, notes:r.get(6)?, word_count: { let wc:i64=r.get(7)?; wc as u32 } }))?;
        let mut out=Vec::new(); for row in rows { out.push(row?); } Ok(out)
    }
    pub fn reorder_scenes(&self, chapter_id:&str, ordered_ids:&[String]) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?; // performance (small scope)
        for (idx,id) in ordered_ids.iter().enumerate() {
            tx.execute(
                "UPDATE scenes SET order_index=?2 WHERE id=?1 AND chapter_id=?3",
                rusqlite::params![id, idx as i64, chapter_id]
            )?;
        }
        tx.commit()?; Ok(())
    }
    pub fn move_scene(&self, scene_id:&str, target_chapter_id:&str) -> Result<Scene> {
        // Fetch current scene meta
        let (old_chapter_id,): (String,) = self.conn.query_row(
            "SELECT chapter_id FROM scenes WHERE id=?1",
            [scene_id],
            |r| Ok((r.get(0)?,))
        )?;
        if old_chapter_id == target_chapter_id {
            // Nothing to do; just return current scene
            return self.conn.query_row(
                "SELECT id,chapter_id,title,content,order_index,status,notes,word_count FROM scenes WHERE id=?1",
                [scene_id],
                |r| Ok(Scene { id:r.get(0)?, chapter_id:r.get(1)?, title:r.get(2)?, content:r.get(3)?, order:{ let v:i64=r.get(4)?; v as u32 }, status:r.get(5)?, notes:r.get(6)?, word_count:{ let w:i64=r.get(7)?; w as u32 } })
            );
        }
        let tx = self.conn.unchecked_transaction()?;
        // Determine new order at end of target chapter
        let new_order: i64 = tx.query_row(
            "SELECT COALESCE(MAX(order_index), -1) + 1 FROM scenes WHERE chapter_id=?1",
            [target_chapter_id],
            |r| r.get(0)
        )?;
        tx.execute(
            "UPDATE scenes SET chapter_id=?2, order_index=?3 WHERE id=?1",
            rusqlite::params![scene_id, target_chapter_id, new_order]
        )?;
        // Re-pack order indexes of old chapter (scope to drop stmt before commit)
        {
            let mut stmt = tx.prepare("SELECT id FROM scenes WHERE chapter_id=?1 ORDER BY order_index ASC")?;
            let rows = stmt.query_map([&old_chapter_id], |r| r.get::<_,String>(0))?;
            for (idx,row) in rows.enumerate() { let sid = row?; tx.execute("UPDATE scenes SET order_index=?2 WHERE id=?1", rusqlite::params![&sid, idx as i64])?; }
        }
        tx.commit()?;
        // Recompute word counts aggregation for chapters
        let _ = self.aggregate_chapter_word_count(&old_chapter_id);
        let _ = self.aggregate_chapter_word_count(target_chapter_id);
        // Return updated scene
        self.conn.query_row(
            "SELECT id,chapter_id,title,content,order_index,status,notes,word_count FROM scenes WHERE id=?1",
            [scene_id],
            |r| Ok(Scene { id:r.get(0)?, chapter_id:r.get(1)?, title:r.get(2)?, content:r.get(3)?, order:{ let v:i64=r.get(4)?; v as u32 }, status:r.get(5)?, notes:r.get(6)?, word_count:{ let w:i64=r.get(7)?; w as u32 } })
        )
    }

    // ========== Editor Settings ==========
    pub fn load_settings(&self) -> Result<EditorSettings> {
        self.conn.query_row("SELECT font_family,font_size,line_height,page_width,theme,show_line_numbers,COALESCE(synonyms_enabled,1),COALESCE(focus_mode_default,0) FROM editor_settings WHERE id=1", [], |r| {
            let show:i64 = r.get(5)?; let syn:i64 = r.get(6)?; let fdef:i64 = r.get(7)?;
            Ok(EditorSettings { font_family:r.get(0)?, font_size:{ let v:i64=r.get(1)?; v as u32 }, line_height:r.get(2)?, page_width:{ let v:i64=r.get(3)?; v as u32 }, theme:r.get(4)?, show_line_numbers: show!=0, synonyms_enabled: syn!=0, focus_mode_default: fdef!=0 })
        })
    }
    pub fn save_settings(&self, s:&EditorSettings) -> Result<()> {
        let show: i64 = if s.show_line_numbers { 1 } else { 0 };
        let syn: i64 = if s.synonyms_enabled { 1 } else { 0 };
        let fmd: i64 = if s.focus_mode_default { 1 } else { 0 };
        self.conn.execute(
            "UPDATE editor_settings SET font_family=?1,font_size=?2,line_height=?3,page_width=?4,theme=?5,show_line_numbers=?6,synonyms_enabled=?7,focus_mode_default=?8 WHERE id=1",
            rusqlite::params![
                &s.font_family,
                s.font_size as i64,
                s.line_height as f64,
                s.page_width as i64,
                &s.theme,
                show,
                syn,
                fmd
            ]
        )?; Ok(())
    }
    // App settings
    pub fn load_app_settings(&self) -> Result<(u32,String,String)> {
        self.conn.query_row("SELECT autosave_interval_ms, language, default_project_location FROM app_settings WHERE id=1", [], |r| {
            let interval: i64 = r.get(0)?; let lang:String = r.get(1)?; let path:String = r.get(2)?; Ok((interval as u32, lang, path))
        })
    }
    pub fn save_app_settings(&self, autosave_interval_ms:u32, language:&str, default_project_location:&str) -> Result<()> {
        self.conn.execute(
            "UPDATE app_settings SET autosave_interval_ms=?1, language=?2, default_project_location=?3 WHERE id=1",
            rusqlite::params![autosave_interval_ms as i64, language, default_project_location]
        )?; Ok(())
    }

    // License state
    #[allow(dead_code)]
    pub fn load_license_state(&self) -> Result<(String, Option<i64>, String, String)> {
        self.conn.query_row("SELECT edition, expires, COALESCE(token,''), COALESCE(features,'{}') FROM license_state WHERE id=1", [], |r| {
            let ed:String = r.get(0)?; let exp:Option<i64> = r.get(1)?; let token:String = r.get(2)?; let feat:String = r.get(3)?; Ok((ed, exp, token, feat))
        })
    }
    #[allow(dead_code)]
    pub fn save_license_state(&self, token:&str, edition:&str, expires:Option<i64>, features:&str) -> Result<()> {
        self.conn.execute(
            "UPDATE license_state SET token=?1, edition=?2, expires=?3, features=?4 WHERE id=1",
            rusqlite::params![token, edition, expires, features]
        )?; Ok(())
    }
}
