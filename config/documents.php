<?php

return [
    'archive_max_bytes' => (int) env('DOCUMENT_ARCHIVE_MAX_BYTES', 512 * 1024 * 1024),
    // One central attachment limit for every document producer. The historic
    // MCP variable remains a compatibility fallback so existing deployments do
    // not silently change behaviour; DOCUMENT_ATTACHMENT_MAX_KB is authoritative.
    'attachment_max_kb' => (int) env(
        'DOCUMENT_ATTACHMENT_MAX_KB',
        env('S4_MCP_ATTACHMENT_MAX_KB', 51200),
    ),

    // Physical document storage is deliberately business-agnostic. Resource
    // type, category, dates and business numbers belong in the database only.
    'storage' => [
        'disk' => env('DOCUMENT_STORAGE_DISK', 'local'),
        'prefix' => env('DOCUMENT_STORAGE_PREFIX', 'documents/blobs'),
    ],

    // Optional server-rendered first-page PDF miniatures. The browser always
    // retains a lazy pdf.js fallback; enable only with maintained Imagick and
    // Ghostscript configured in an isolated/limited queue worker.
    'previews' => [
        'pdf_enabled' => (bool) env('DOCUMENT_PDF_THUMBNAILS_ENABLED', false),
        'max_pdf_bytes' => (int) env('DOCUMENT_PDF_THUMBNAIL_MAX_BYTES', 12 * 1024 * 1024),
    ],

    'mcp' => [
        'max_text_chars' => (int) env('MCP_DOCUMENT_MAX_TEXT_CHARS', 30000),
        'create_missing_categories' => (bool) env('MCP_DOCUMENT_CREATE_MISSING_CATEGORIES', true),
    ],
];
