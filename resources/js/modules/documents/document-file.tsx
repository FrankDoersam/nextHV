import { ErrorState, SectionCard, Loading } from "@/components/blocks/content";
import { Button } from "@/components/ui/button";
import { useReload } from "@/framework/data/hooks";
import { request } from "@/framework/data/http";
import type { RecordData } from "@/framework/types";
import { Download, Eye, FileCheck, Upload } from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { toast } from "sonner";
import { Overlay } from "@/components/blocks/overlay";
const PdfViewer = lazy(() => import("@/components/blocks/pdf-viewer"));
export default function DocumentFile({ record }: { record: RecordData }) {
    const input = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    const reload = useReload();
    const upload = async (file?: File) => {
        if (!file) return;
        setBusy(true);
        setError(undefined);
        try {
            const body = new FormData();
            body.append("file", file);
            await request(`/api/v1/identity-documents/${record.id}/file`, body);
            await reload();
            toast.success("Nachweis gespeichert");
        } catch (e) {
            setError(e);
        } finally {
            setBusy(false);
            if (input.current) input.current.value = "";
        }
    };
    return (
        <SectionCard
            title="Geschützter Nachweis"
            description="PDF, JPEG oder PNG · maximal 10 MB"
        >
            <div className="flex flex-wrap items-center gap-3">
                <FileCheck className="text-primary" />
                <span className="mr-auto text-sm text-muted-foreground">
                    {record.size
                        ? `${Math.ceil(Number(record.size) / 1024)} KB · ${record.mime_type}`
                        : "Noch keine Datei hinterlegt"}
                </span>
                <input
                    ref={input}
                    type="file"
                    className="sr-only"
                    aria-label="Nachweis auswählen"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(e) => upload(e.target.files?.[0])}
                />
                <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => input.current?.click()}
                >
                    <Upload />
                    {busy ? "Wird gespeichert …" : "Datei hochladen"}
                </Button>
                {record.mime_type === "application/pdf" && (
                    <Button variant="outline" onClick={() => setPreview(true)}>
                        <Eye /> Vorschau
                    </Button>
                )}
                {!!record.size && (
                    <Button
                        variant="outline"
                        onClick={() =>
                            window.location.assign(
                                `/api/v1/identity-documents/${record.id}/file`,
                            )
                        }
                    >
                        <Download />
                        Herunterladen
                    </Button>
                )}
            </div>
            {!!error && <ErrorState error={error} />}
            {preview && (
                <Overlay
                    open
                    onClose={() => setPreview(false)}
                    title="Dokumentvorschau"
                    presentation="dialog"
                    size="wide"
                >
                    <Suspense fallback={<Loading />}>
                        <PdfViewer
                            url={`/api/v1/identity-documents/${record.id}/file`}
                            name={`Nachweis-${record.id}.pdf`}
                        />
                    </Suspense>
                </Overlay>
            )}
        </SectionCard>
    );
}
