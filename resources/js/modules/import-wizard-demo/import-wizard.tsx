import { useMemo, useState } from "react";
import { CrmImportWizardShell, CRM_IMPORT_STEPS } from "@/components/reui/crm-import/wizard-shell";
import { ImportUploadStep } from "@/components/reui/crm-import/upload-step";
import { DuplicatesStep, MapColumnsStep, mappedField, PreviewStep, SummaryStep, type DuplicateMode } from "@/components/reui/crm-import/steps";
import { exampleFiles, loadSelectedFiles, previewDuplicateCount, targetOptions, viewForFile, type ImportTarget, type WizardFile } from "@/lib/crm-import/model";

/** Controller only: business state and navigation. All presentation lives in
 * shared resources/js/components/reui/crm-import components.
 */
export function ImportWizardDemo() {
    const [step, setStep] = useState(1);
    const [unlockedStep, setUnlockedStep] = useState(1);
    const [files, setFiles] = useState<WizardFile[]>(() => exampleFiles);
    const [target, setTarget] = useState<ImportTarget>("contacts");
    const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("skip");
    const [uniqueKey, setUniqueKey] = useState("email");
    const [reading, setReading] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [message, setMessage] = useState<string>();

    const source = files.find((file) => file.kind === "csv" && file.data);
    const isExample = !!source?.example;
    const view = useMemo(
        () => viewForFile(source, firstRowIsHeader),
        [source, firstRowIsHeader],
    );
    const mappingsCount = view?.columns.filter(
        (column) => mappedField(column, mapping, target) !== "skip",
    ).length ?? 0;
    const duplicates = useMemo(
        () => previewDuplicateCount(view, mapping),
        [view, mapping],
    );

    const resetSteps = () => {
        setStep(1);
        setUnlockedStep(1);
        setMapping({});
        setDuplicateMode("skip");
        setUniqueKey("email");
        setCompleted(false);
        setMessage(undefined);
    };

    const addFiles = async (selected: File[]) => {
        if (!selected.length || reading) return;
        setReading(true);
        setMessage(undefined);
        try {
            const result = await loadSelectedFiles(selected);
            if (result.files.length) {
                setFiles((previous) => [
                    ...previous.filter(
                        (entry) =>
                            !entry.example &&
                            !result.files.some((file) => file.name === entry.name),
                    ),
                    ...result.files,
                ]);
                resetSteps();
            }
            if (result.errors.length) setMessage(result.errors.join(" "));
        } catch {
            setMessage("Cannot read selected files.");
        } finally {
            setReading(false);
        }
    };

    const next = () => {
        setMessage(undefined);
        if (step === 1 && !view) {
            setMessage("Select a CSV file to preview. Excel files need a separate import parser.");
            return;
        }
        if (step === 2 && (!mappingsCount || (target === "contacts" &&
            ["fullName", "email", "owner"].some((required) =>
                !view?.columns.some((column) => mappedField(column, mapping, target) === required))))) {
            setMessage("Map the required Full name, Email and Owner fields before continuing.");
            return;
        }
        if (step === 5) {
            setCompleted(true);
            return;
        }
        setStep((current) => current + 1);
        setUnlockedStep((current) => Math.max(current, step + 1));
    };

    const fileSummary = files.length
        ? files[0].name + (files.length > 1 ? " + " + (files.length - 1) + " file" + (files.length > 2 ? "s" : "") : "")
        : "No files selected";

    return (
        <CrmImportWizardShell
            variant="tabs"
            step={step}
            unlockedStep={unlockedStep}
            onStepChange={(value) => {
                if (Number.isInteger(value) && value <= unlockedStep && value >= 1) {
                    setStep(value);
                    setMessage(undefined);
                }
            }}
            onBack={() => setStep(step - 1)}
            onNext={next}
            fileSummary={fileSummary}
            rowCount={view?.totalRows}
            targetLabel={targetOptions.find((option) => option.value === target)?.label ?? target}
            reading={reading}
            completed={completed}
            message={message}
            tabs={CRM_IMPORT_STEPS.map((label, index) => ({
                value: String(index + 1),
                label,
                ...(index === 1 && view ? {
                    badge: { value: mappingsCount + "/" + view.columns.length, variant: "primary-light" as const },
                } : {}),
                ...(index === 2 && view ? {
                    badge: { value: Math.min(view.rows.length, 5), variant: "info-light" as const },
                } : {}),
                ...(index === 3 && view ? {
                    badge: { value: isExample ? 36 : duplicates, variant: "warning-light" as const },
                } : {}),
            }))}
            panels={[
            <ImportUploadStep
                files={files}
                onAdd={(selection) => void addFiles(selection)}
                onRemove={(id) => {
                    setFiles((current) => current.filter((file) => file.id !== id));
                    resetSteps();
                }}
                target={target}
                onTargetChange={(value) => {
                    setTarget(value);
                    resetSteps();
                }}
                firstRowIsHeader={firstRowIsHeader}
                onHeaderChange={(value) => {
                    setFirstRowIsHeader(value);
                    resetSteps();
                }}
                reading={reading}
            />,
            view ? <MapColumnsStep
                view={view} target={target} mapping={mapping}
                isExample={isExample}
                onMap={(column, field) =>
                    setMapping((current) => ({ ...current, [column]: field }))}
            /> : null,
            view ? <PreviewStep
                view={view} target={target} mapping={mapping}
                isExample={isExample} uniqueKey={uniqueKey}
                onUniqueKey={setUniqueKey}
            /> : null,
            view ? <DuplicatesStep
                count={duplicates} mode={duplicateMode}
                onModeChange={setDuplicateMode} isExample={isExample}
            /> : null,
            view ? <SummaryStep
                view={view} target={target} files={fileSummary}
                duplicateMode={duplicateMode} uniqueKey={uniqueKey}
                duplicates={duplicates} isExample={isExample}
                completed={completed}
            /> : null,
            ]}
        />
    );
}
