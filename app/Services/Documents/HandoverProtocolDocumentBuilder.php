<?php

namespace App\Services\Documents;

/**
 * Dedicated move-in handover form.
 */
final class HandoverProtocolDocumentBuilder
{
    use BuildsResidentialInspectionProtocol;

    /** @return array<int, array<string, mixed>> */
    public function build(): array
    {
        return $this->buildInspectionProtocol(false);
    }
}
