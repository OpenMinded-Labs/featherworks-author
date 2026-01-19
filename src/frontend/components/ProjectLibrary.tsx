import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';

interface ProjectEntry {
    path: string;
    title: string;
    last_opened: string;
    author?: string;
    genre?: string;
    series?: string;
    series_order?: number;
    word_count?: number;
    created_at?: string;
    tags?: string[];
}

interface ProjectLibraryMeta {
    author?: string;
    genre?: string;
    series?: string;
    series_order?: number;
    word_count?: number;
    tags?: string[];
}

type SortField = 'title' | 'author' | 'last_opened' | 'created_at' | 'series' | 'word_count';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';

interface Props {
    onOpenProject: (path: string) => void;
    onBack: () => void;
}

export const ProjectLibrary: React.FC<Props> = ({ onOpenProject, onBack }) => {
    const { t } = useTranslation();
    const [projects, setProjects] = useState<ProjectEntry[]>([]);
    const [series, setSeries] = useState<string[]>([]);
    const [genres, setGenres] = useState<string[]>([]);
    const [allTags, setAllTags] = useState<string[]>([]);
    
    const [sortField, setSortField] = useState<SortField>('last_opened');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterSeries, setFilterSeries] = useState<string>('');
    const [filterGenre, setFilterGenre] = useState<string>('');
    const [filterTag, setFilterTag] = useState<string>('');
    
    const [editingProject, setEditingProject] = useState<ProjectEntry | null>(null);
    const [editMeta, setEditMeta] = useState<ProjectLibraryMeta>({});
    const [tagsInput, setTagsInput] = useState(''); // Separate state for tags input

    // Load data
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [projectList, seriesList, genreList, tagList] = await Promise.all([
                invoke<ProjectEntry[]>('list_recent_projects'),
                invoke<string[]>('list_series'),
                invoke<string[]>('list_genres'),
                invoke<string[]>('list_tags'),
            ]);
            setProjects(projectList);
            setSeries(seriesList);
            setGenres(genreList);
            setAllTags(tagList);
        } catch (e) {
            console.error('Failed to load library data:', e);
        }
    };

    // Filtered and sorted projects
    const filteredProjects = useMemo(() => {
        let result = [...projects];
        
        // Search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(p => 
                p.title.toLowerCase().includes(q) ||
                p.author?.toLowerCase().includes(q) ||
                p.series?.toLowerCase().includes(q) ||
                p.tags?.some(tag => tag.toLowerCase().includes(q))
            );
        }
        
        // Series filter
        if (filterSeries) {
            result = result.filter(p => p.series === filterSeries);
        }
        
        // Genre filter
        if (filterGenre) {
            result = result.filter(p => p.genre === filterGenre);
        }
        
        // Tag filter
        if (filterTag) {
            result = result.filter(p => p.tags?.includes(filterTag));
        }
        
        // Sort
        result.sort((a, b) => {
            let cmp = 0;
            switch (sortField) {
                case 'title':
                    cmp = (a.title || '').localeCompare(b.title || '');
                    break;
                case 'author':
                    cmp = (a.author || '').localeCompare(b.author || '');
                    break;
                case 'last_opened':
                    cmp = (a.last_opened || '').localeCompare(b.last_opened || '');
                    break;
                case 'created_at':
                    cmp = (a.created_at || '').localeCompare(b.created_at || '');
                    break;
                case 'series':
                    // Sort by series first, then by series_order
                    cmp = (a.series || '').localeCompare(b.series || '');
                    if (cmp === 0) {
                        cmp = (a.series_order || 0) - (b.series_order || 0);
                    }
                    break;
                case 'word_count':
                    cmp = (a.word_count || 0) - (b.word_count || 0);
                    break;
            }
            return sortDirection === 'asc' ? cmp : -cmp;
        });
        
        return result;
    }, [projects, searchQuery, filterSeries, filterGenre, filterTag, sortField, sortDirection]);

    // Group by series if sorting by series
    const groupedProjects = useMemo(() => {
        if (sortField !== 'series' || filterSeries) {
            return { '': filteredProjects };
        }
        
        const groups: Record<string, ProjectEntry[]> = {};
        const standalone: ProjectEntry[] = [];
        
        for (const p of filteredProjects) {
            if (p.series) {
                if (!groups[p.series]) groups[p.series] = [];
                groups[p.series].push(p);
            } else {
                standalone.push(p);
            }
        }
        
        // Sort each series by order
        for (const key of Object.keys(groups)) {
            groups[key].sort((a, b) => (a.series_order || 0) - (b.series_order || 0));
        }
        
        if (standalone.length > 0) {
            groups[t('library.standalone')] = standalone;
        }
        
        return groups;
    }, [filteredProjects, sortField, filterSeries, t]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(field === 'title' || field === 'author' ? 'asc' : 'desc');
        }
    };

    const handleEditProject = (project: ProjectEntry) => {
        setEditingProject(project);
        setEditMeta({
            author: project.author,
            genre: project.genre,
            series: project.series,
            series_order: project.series_order,
            word_count: project.word_count,
            tags: project.tags,
        });
        setTagsInput((project.tags || []).join(', '));
    };

    const handleSaveEdit = async () => {
        if (!editingProject) return;
        // Parse tags from input on save
        const parsedTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
        const metaToSave = { ...editMeta, tags: parsedTags.length > 0 ? parsedTags : undefined };
        try {
            await invoke('update_library_project', {
                path: editingProject.path,
                title: editingProject.title,
                meta: metaToSave,
            });
            await loadData();
            setEditingProject(null);
        } catch (e) {
            console.error('Failed to save project metadata:', e);
        }
    };

    const handleRemoveProject = async (path: string) => {
        if (!confirm(t('library.confirmRemove'))) return;
        try {
            await invoke('remove_from_library', { path });
            await loadData();
        } catch (e) {
            console.error('Failed to remove project:', e);
        }
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString();
        } catch {
            return dateStr;
        }
    };

    const formatWordCount = (count?: number) => {
        if (!count) return '-';
        if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}k`;
        }
        return count.toString();
    };

    return (
        <div className="library-container">
            {/* Header */}
            <div className="library-header">
                <button className="library-back-btn" onClick={onBack}>
                    ← {t('library.back')}
                </button>
                <h1 className="library-title">📚 {t('library.title')}</h1>
                <div className="library-stats">
                    <span>{projects.length} {t('library.projects')}</span>
                    {series.length > 0 && <span>• {series.length} {t('library.series')}</span>}
                </div>
            </div>

            {/* Toolbar */}
            <div className="library-toolbar">
                <div className="library-search">
                    <input
                        type="text"
                        placeholder={t('library.search')}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="library-search-input"
                    />
                    {searchQuery && (
                        <button className="library-search-clear" onClick={() => setSearchQuery('')}>×</button>
                    )}
                </div>

                <div className="library-filters">
                    <select 
                        value={filterSeries} 
                        onChange={e => setFilterSeries(e.target.value)}
                        className="library-filter-select"
                        aria-label={t('library.allSeries')}
                    >
                        <option value="">{t('library.allSeries')}</option>
                        {series.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <select 
                        value={filterGenre} 
                        onChange={e => setFilterGenre(e.target.value)}
                        className="library-filter-select"
                        aria-label={t('library.allGenres')}
                    >
                        <option value="">{t('library.allGenres')}</option>
                        {genres.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>

                    {allTags.length > 0 && (
                        <select 
                            value={filterTag} 
                            onChange={e => setFilterTag(e.target.value)}
                            className="library-filter-select"
                            aria-label={t('library.allTags')}
                        >
                            <option value="">{t('library.allTags')}</option>
                            {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                        </select>
                    )}
                </div>

                <div className="library-sort">
                    <span className="library-sort-label">{t('library.sortBy')}:</span>
                    {(['last_opened', 'title', 'author', 'series', 'word_count'] as SortField[]).map(field => (
                        <button
                            key={field}
                            className={`library-sort-btn ${sortField === field ? 'active' : ''}`}
                            onClick={() => handleSort(field)}
                        >
                            {t(`library.sort.${field}`)}
                            {sortField === field && (
                                <span className="sort-indicator">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="library-view-toggle">
                    <button 
                        className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                        onClick={() => setViewMode('grid')}
                        title={t('library.gridView')}
                    >
                        ▦
                    </button>
                    <button 
                        className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                        onClick={() => setViewMode('list')}
                        title={t('library.listView')}
                    >
                        ☰
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className={`library-content ${viewMode}`}>
                {Object.entries(groupedProjects).map(([groupName, groupProjects]) => (
                    <div key={groupName || 'all'} className="library-group">
                        {groupName && sortField === 'series' && !filterSeries && (
                            <h2 className="library-group-title">
                                {groupName === t('library.standalone') ? '📄' : '📚'} {groupName}
                                <span className="group-count">({groupProjects.length})</span>
                            </h2>
                        )}
                        
                        <div className={`library-projects ${viewMode}`}>
                            {groupProjects.map(project => (
                                <div 
                                    key={project.path} 
                                    className={`library-project-card ${viewMode}`}
                                    onClick={() => onOpenProject(project.path)}
                                >
                                    <div className="project-card-main">
                                        <div className="project-card-icon">📖</div>
                                        <div className="project-card-info">
                                            <h3 className="project-card-title">{project.title}</h3>
                                            {project.author && (
                                                <p className="project-card-author">✍️ {project.author}</p>
                                            )}
                                            {project.series && (
                                                <p className="project-card-series">
                                                    📚 {project.series}
                                                    {project.series_order && ` #${project.series_order}`}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="project-card-meta">
                                        {project.genre && (
                                            <span className="project-card-genre">{project.genre}</span>
                                        )}
                                        {project.word_count && (
                                            <span className="project-card-words">
                                                {formatWordCount(project.word_count)} {t('library.words')}
                                            </span>
                                        )}
                                        <span className="project-card-date">
                                            {formatDate(project.last_opened)}
                                        </span>
                                    </div>

                                    {project.tags && project.tags.length > 0 && (
                                        <div className="project-card-tags">
                                            {project.tags.slice(0, 3).map(tag => (
                                                <span key={tag} className="project-tag">{tag}</span>
                                            ))}
                                            {project.tags.length > 3 && (
                                                <span className="project-tag more">+{project.tags.length - 3}</span>
                                            )}
                                        </div>
                                    )}

                                    <div className="project-card-actions">
                                        <button
                                            className="project-action-btn edit"
                                            onClick={(e) => { e.stopPropagation(); handleEditProject(project); }}
                                            title={t('library.edit')}
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            className="project-action-btn remove"
                                            onClick={(e) => { e.stopPropagation(); handleRemoveProject(project.path); }}
                                            title={t('library.remove')}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {filteredProjects.length === 0 && (
                    <div className="library-empty">
                        <span className="library-empty-icon">📭</span>
                        <p>{searchQuery || filterSeries || filterGenre || filterTag 
                            ? t('library.noResults') 
                            : t('library.empty')
                        }</p>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {editingProject && (
                <div className="modal-overlay" onClick={() => setEditingProject(null)}>
                    <div className="modal-content library-edit-modal" onClick={e => e.stopPropagation()}>
                        <h2>✏️ {t('library.editProject')}</h2>
                        <p className="edit-project-title">{editingProject.title}</p>
                        
                        <div className="form-group">
                            <label>{t('library.field.author')}</label>
                            <input
                                value={editMeta.author || ''}
                                onChange={e => setEditMeta({ ...editMeta, author: e.target.value })}
                                placeholder={t('library.placeholder.author')}
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>{t('library.field.series')}</label>
                                <input
                                    value={editMeta.series || ''}
                                    onChange={e => setEditMeta({ ...editMeta, series: e.target.value })}
                                    placeholder={t('library.placeholder.series')}
                                    list="series-list"
                                />
                                <datalist id="series-list">
                                    {series.map(s => <option key={s} value={s} />)}
                                </datalist>
                            </div>
                            <div className="form-group form-group-sm">
                                <label>{t('library.field.seriesOrder')}</label>
                                <input
                                    type="number"
                                    min={1}
                                    value={editMeta.series_order || ''}
                                    onChange={e => setEditMeta({ ...editMeta, series_order: parseInt(e.target.value) || undefined })}
                                    placeholder="#"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>{t('library.field.genre')}</label>
                            <input
                                value={editMeta.genre || ''}
                                onChange={e => setEditMeta({ ...editMeta, genre: e.target.value })}
                                placeholder={t('library.placeholder.genre')}
                                list="genre-list"
                            />
                            <datalist id="genre-list">
                                {genres.map(g => <option key={g} value={g} />)}
                            </datalist>
                        </div>

                        <div className="form-group">
                            <label>{t('library.field.tags')}</label>
                            <input
                                value={tagsInput}
                                onChange={e => setTagsInput(e.target.value)}
                                placeholder={t('library.placeholder.tags')}
                                className="library-edit-input"
                            />
                            <small className="form-hint">{t('library.tagsHint')}</small>
                        </div>

                        <div className="modal-actions">
                            <button className="secondary" onClick={() => setEditingProject(null)}>
                                {t('cancel')}
                            </button>
                            <button className="primary" onClick={handleSaveEdit}>
                                {t('save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
