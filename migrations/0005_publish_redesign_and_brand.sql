-- Incremental migration: merge posts.title into posts.content, drop title column, and rebrand default site_name to dev社区

UPDATE posts
SET content = CASE
  WHEN trim(COALESCE(title, '')) != '' AND trim(COALESCE(content, '')) != ''
    THEN trim(title) || char(10) || trim(content)
  WHEN trim(COALESCE(title, '')) != ''
    THEN trim(title)
  ELSE trim(COALESCE(content, ''))
END;

ALTER TABLE posts DROP COLUMN title;

UPDATE admin_config
SET site_name = 'dev社区'
WHERE id = 1 AND trim(site_name) = '拾光集 · 轻图文社区';
