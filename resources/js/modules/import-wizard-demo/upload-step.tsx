import { useEffect } from "react";
import { FileText, Upload, X } from "lucide-react";
import { useFileUpload } from "@/hooks/use-file-upload";
import { Badge } from "@/components/reui/badge";
import {
    Item, ItemActions, ItemButton, ItemContent, ItemDescription,
    ItemGroup, ItemMedia, ItemTitle,
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ImportTargetSelect } from "./import-target-select";
import {
    acceptedFileTypes, displayFileSize, targetOptions,
    type ImportTarget, type WizardFile,
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

export function ImportFileDropzone({
    onAdd, reading,
}: Pick<UploadProps, "onAdd" | "reading">) {
    const [upload, actions] = useFileUpload({
        multiple: true, accept: acceptedFileTypes, maxSize: 10 * 1024 * 1024,
        onFilesAdded: (added) => onAdd(
            added.map((item) => item.file).filter((file): file is File => file instanceof File),
        ),
    });
    useEffect(() => {
        if (upload.files.length) actions.clearFiles();
    }, [upload.files.length, actions.clearFiles]);

    return <Field className="gap-3">
        <FieldLabel htmlFor="reui-import-files">
            Source Files <span className="text-destructive">*</span>
        </FieldLabel>
        <input {...actions.getInputProps({
            id: "reui-import-files", className: "sr-only", disabled: reading,
            "aria-label": "Choose source files",
        })} />
        <ItemButton
            id="reui-import-dropzone" type="button" disabled={reading}
            aria-describedby="reui-upload-help"
            className={
                "min-h-40 flex-col justify-center gap-3 rounded-lg border-dashed px-6 py-8 text-center " +
                (upload.isDragging ? "border-primary bg-muted/50" : "hover:border-primary/60 hover:bg-muted/40")
            }
            onClick={actions.openFileDialog}
            onDragEnter={actions.handleDragEnter}
            onDragOver={actions.handleDragOver}
            onDragLeave={actions.handleDragLeave}
            onDrop={actions.handleDrop}
        >
            <ItemMedia className="mx-auto size-auto">
                <Upload className="size-4" aria-hidden="true" />
            </ItemMedia>
            <ItemContent className="flex-none items-center gap-1">
                <ItemTitle>{reading ? "Reading files…" : "Drop Files"}</ItemTitle>
                <ItemDescription id="reui-upload-help" className="text-center">
                    Browse or drag files here.
                </ItemDescription>
                <ItemDescription className="text-center text-xs">
                    CSV, Excel, PDF, PNG, or JPG. Max 10MB each.
                </ItemDescription>
            </ItemContent>
        </ItemButton>
        {upload.errors.length > 0 && (
            <p role="alert" className="text-sm text-destructive">{upload.errors.join(" ")}</p>
        )}
    </Field>;
}

export function SelectedImportFiles({ files, onRemove }: Pick<UploadProps, "files" | "onRemove">) {
    return <ItemGroup role="list" aria-label="Selected files">
        {files.map((file) => (
            <Item key={file.id} role="listitem" size="sm" className="min-w-0 gap-3">
                <ItemMedia><FileText className="size-4" aria-hidden="true" /></ItemMedia>
                <ItemContent>
                    <ItemTitle>{file.name}</ItemTitle>
                    <ItemDescription className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span>{file.kind === "csv" ? "CSV" : file.kind === "excel" ? "Excel" : file.kind === "image" ? "Image" : "PDF"}</span>
                        <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-muted-foreground/40" />
                        <span>{displayFileSize(file.bytes)}</span>
                        {file.data && <>
                            <span aria-hidden="true">·</span>
                            <span>{file.data.totalRows.toLocaleString("en-US")} rows</span>
                        </>}
                    </ItemDescription>
                </ItemContent>
                <ItemActions>
                    <Badge variant="success-light">Ready</Badge>
                    <Button type="button" size="icon-sm" variant="ghost"
                        aria-label={"Remove " + file.name} onClick={() => onRemove(file.id)}>
                        <X className="size-4" />
                    </Button>
                </ItemActions>
            </Item>
        ))}
        {!files.length && (
            <Item role="listitem" className="justify-center border-dashed p-4 text-sm text-muted-foreground">
                No files selected.
            </Item>
        )}
    </ItemGroup>;
}

export function ImportUploadStep(props: UploadProps) {
    return <section className="flex flex-col gap-6" aria-labelledby="reui-upload-title">
        <div className="flex flex-col gap-1">
            <h2 id="reui-upload-title" className="text-base font-semibold">Upload Files</h2>
            <p className="text-sm text-muted-foreground">Add CRM exports and source assets.</p>
        </div>
        <FieldGroup>
            <ImportFileDropzone onAdd={props.onAdd} reading={props.reading} />
            <SelectedImportFiles files={props.files} onRemove={props.onRemove} />
            <Field>
                <FieldLabel htmlFor="reui-import-target">Import into</FieldLabel>
                <ImportTargetSelect value={props.target} onValueChange={props.onTargetChange} />
            </Field>
            <Field orientation="horizontal" className="items-start gap-3">
                <Switch id="reui-header-switch"
                    checked={props.firstRowIsHeader}
                    onCheckedChange={props.onHeaderChange}
                    aria-labelledby="reui-header-label"
                />
                <FieldContent>
                    <FieldLabel htmlFor="reui-header-switch" id="reui-header-label">
                        First row is a header
                    </FieldLabel>
                    <FieldDescription>
                        Row 1 holds column names like Name, Email, Company.
                    </FieldDescription>
                </FieldContent>
            </Field>
        </FieldGroup>
    </section>;
}