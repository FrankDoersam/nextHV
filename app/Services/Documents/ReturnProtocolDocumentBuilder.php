<?php

namespace App\Services\Documents;

/**
 * Dedicated move-out inspection form.
 */
final class ReturnProtocolDocumentBuilder
{
    use BuildsResidentialInspectionProtocol;

    /** @return array<int, array<string, mixed>> */
    public function build(): array
    {
        return $this->buildInspectionProtocol(true);
    }
}
