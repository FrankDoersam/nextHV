import { useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { FrameDescription } from "@/components/reui/frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    acceptedFileTypes,
    displayFileSize,
    targetOptions,
    type ImportTarget,
    type WizardFile,
} from "./model";

interface UploadProps {
    files: WizardFile[];
    onAdd: (files: File[]) => void;
    onRemove: (id: string) => void;
    target: ImportTarget;
    onTargetChange: (target: ImportTarget) => void;
    firstRowIsHeader: boolean;
    onHeaderChange: (checked: boolean) => void;
    reading: boolean;
}

/** ReUI Item-style dropzone built with the existing Base UI Button primitive. */
export function ImportFileDropzone({
    onAdd,
    reading,
}: Pick<UploadProps, "onAdd" | "reading">) {
    const input = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    return (
        <div className="flex flex-col gap-3">
            <label htmlFor="reui-import-files" className="text-sm font-medium">
                Source Files <span className="text-destructive">*</span>
            </label>
            <input
                id="reui-import-files"
                ref={input}
                type="file"
                accept={acceptedFileTypes}
                className="sr-only"
                multiple
                onChange={(event) => {
                    onAdd(Array.from(event.target.files ?? []));
                    event.target.value = "";
                }}
            />
            <Button
                id="reui-import-dropzone"
                type="button"
                variant="outline"
                disabled={reading}
                aria-describedby="reui-upload-help"
                className={
                    "min-h-40 w-full flex-col gap-3 rounded-xl border-dashed px-6 py-8 text-center transition-colors " +
                    (dragging ? "border-primary bg-muted/50" : "hover:border-primary/60 hover:bg-muted/40")
                }
                onClick={() => input.current?.click()}
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={(event) => {
                    event.preventDefault();
                    setDragging(false);
                }}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    onAdd(Array.from(event.dataTransfer.files));
                }}
            >
                <Upload className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">{reading ? "Reading files…" : "Drop Files"}</span>
                <span id="reui-upload-help" className="text-sm font-normal text-muted-foreground">
                    Browse or drag files here.
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                    CSV, Excel, PDF, PNG, or JPG. Max 10MB each.
                </span>
            </Button>
        </div>
    );
}

export function SelectedImportFiles({
    files,
    onRemove,
}: Pick<UploadProps, "files" | "onRemove">) {
    return (
        <ul aria-label="Selected files" className="flex flex-col gap-2">
            {files.map((file) => (
                <li key={file.id} className="flex min-w-0 items-center gap-3 rounded-xl border p-3">
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{file.name}</p>
                        <FrameDescription className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span>{file.kind === "csv" ? "CSV" : file.kind === "excel" ? "Excel" : file.kind === "image" ? "Image" : "PDF"}</span>
                            <span aria-hidden="true">·</span>
                            <span>{displayFileSize(file.bytes)}</span>
                            {file.data && (
                                <>
                                    <span aria-hidden="true">·</span>
                                    <span>{file.data.totalRows.toLocaleString("en-US")} rows</span>
                                </>
                            )}
                        </FrameDescription>
                    </div>
                    <Badge variant="secondary" className="border border-primary/10 bg-primary/10 text-foreground">
                        Ready
                    </Badge>
                    <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={"Remove " + file.name}
                        onClick={() => onRemove(file.id)}
                    >
                        <X className="size-4" />
                    </Button>
                </li>
            ))}
            {files.length === 0 && (
                <li className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No files selected.
                </li>
            )}
        </ul>
    );
}

export function ImportUploadStep(props: UploadProps) {
    return (
        <section className="flex flex-col gap-6" aria-labelledby="reui-upload-title">
            <div className="flex flex-col gap-1">
                <h2 id="reui-upload-title" className="text-base font-semibold">Upload Files</h2>
                <p className="text-sm text-muted-foreground">Add CRM exports and source assets.</p>
            </div>
            <ImportFileDropzone onAdd={props.onAdd} reading={props.reading} />
            <SelectedImportFiles files={props.files} onRemove={props.onRemove} />
            <div className="flex flex-col gap-2">
                <label htmlFor="reui-import-target" className="text-sm font-medium">Import into</label>
                <Select
                    value={props.target}
                    onValueChange={(value) => {
                        if (value) props.onTargetChange(value as ImportTarget);
                    }}
                >
                    <SelectTrigger id="reui-import-target" className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {targetOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex items-start gap-3">
                <Switch
                    checked={props.firstRowIsHeader}
                    onCheckedChange={props.onHeaderChange}
                    aria-labelledby="reui-header-label"
                />
                <div className="flex min-w-0 flex-col gap-1">
                    <p id="reui-header-label" className="text-sm font-medium">
                        First row is a header
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Row 1 holds column names like Name, Email, Company.
                    </p>
                </div>
            </div>
        </section>
    );
}
