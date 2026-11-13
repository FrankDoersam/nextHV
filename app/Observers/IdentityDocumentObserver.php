<?php

namespace App\Observers;

use App\Models\IdentityDocument;

class IdentityDocumentObserver
{
    public function saving(IdentityDocument $document): void
    {
        if ($document->isDirty('document_number')) {
            $document->number_last_four = $document->document_number ? mb_substr($document->document_number, -4) : null;
        }
    }
}
