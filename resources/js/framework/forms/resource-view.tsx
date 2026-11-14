import { useEffect, useState, type ReactNode } from "react";
import { Pencil, RefreshCw } from "lucide-react";
import { CopyLinkButton } from "@/components/blocks/copy-link-button";
import { ErrorState } from "@/components/blocks/content";
import { FormSection } from "@/components/blocks/form-section";
import { KeyValueRows } from "@/components/blocks/key-value-rows";
import { Stack } from "@/components/blocks/layout";
import { Overlay } from "@/components/blocks/overlay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { label } from "@/lib/format";
import { dataProvider } from "../data/provider";
import { useReload } from "../data/hooks";
import { can } from "../permissions";
import { RelationCollection } from "../tables/relation-collection";
import { RowActions } from "../tables/resource-collection";
import type { FormRequest, RecordData } from "../types";
import { formatFieldValue } from "./field-display";

/** Read and edit share field/group metadata; a view never mounts form inputs. */
export function ResourceView({
    request,
    onClose,
    onEdit,
    nested,
    stacked,
}: {
    request: FormRequest & { row: RecordData };
    onClose: () => void;
    onEdit: (row: RecordData, fields?: string[]) => void;
    nested?: ReactNode;
    stacked?: boolean;
}) {
    const { resource } = request;
    const [record, setRecord] = useState(request.row);
    const [error, setError] = useState<unknown>();
    const [refreshing, setRefreshing] = useState(false);
    const reload = useReload();
    useEffect(() => setRecord(request.row), [request.row]);
    const fields = resource.fields.filter((field) => !field.writeOnly);
    const groups = resource.groups?.filter((group) =>
        fields.some((field) => (field.group ?? "general") === group.id),
    ) ?? [{ id: "general", label: "Grunddaten" }];
    const tabs = resource.editor?.tabs?.filter(
        (tab) =>
            tab.relations ||
            tab.groups?.some((id) => groups.some((group) => group.id === id)),
    );
    const [tab, setTab] = useState(tabs?.[0]?.id ?? "");
    const activeTab = tabs?.find((item) => item.id === tab) ?? tabs?.[0];
    const editable = can(resource.name, "edit", record);
    const refresh = async () => {
        setRefreshing(true);
        setError(undefined);
        try {
            setRecord(await dataProvider.one(resource, record.id));
        } catch (error) {
            setError(error);
        } finally {
            setRefreshing(false);
        }
    };
    return (
        <Overlay
            open
            onClose={onClose}
            title={String(
                record[resource.titleField] ??
                    `${resource.singular} #${record.id}`,
            )}
            description={resource.singular}
            icon={<resource.icon />}
            titleBadge={
                resource.editor?.titleBadge !== false && record.status ? (
                    <Badge variant="secondary">
                        {label(String(record.status))}
                    </Badge>
                ) : undefined
            }
            presentation={request.presentation}
            nested={nested}
            stacked={stacked}
            tabs={
                activeTab && tabs
                    ? {
                          value: activeTab.id,
                          onValueChange: setTab,
                          icons: resource.editor?.tabIcons,
                          items: tabs.map((item) => ({
                              value: item.id,
                              label: item.label,
                              icon: item.icon ?? resource.icon,
                          })),
                      }
                    : undefined
            }
            actions={
                <div className="flex items-center gap-1">
                    <CopyLinkButton onError={setError} />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={refreshing}
                        aria-label="Ansicht aktualisieren"
                        onClick={() => void refresh()}
                    >
                        <RefreshCw />
                    </Button>
                    <RowActions
                        resource={resource}
                        row={record}
                        placement="detail"
                        exclude={["edit", "view"]}
                        instance={{ refreshForm: refresh, reload }}
                    />
                </div>
            }
            footer={
                <>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Schließen
                    </Button>
                    {editable && (
                        <Button type="button" onClick={() => onEdit(record)}>
                            <Pencil />
                            Bearbeiten
                        </Button>
                    )}
                </>
            }
        >
            <Stack>
                {!!error && <ErrorState error={error} retry={refresh} />}
                {groups.map((group) => {
                    const sectionFields = fields.filter(
                        (field) => (field.group ?? "general") === group.id,
                    );
                    const editableFields = resource.fields
                        .filter(
                            (field) =>
                                (field.group ?? "general") === group.id &&
                                !field.readonlyOnEdit &&
                                !field.disabled &&
                                !(
                                    request.context?.field === field.name &&
                                    request.context.mode !== "prefill"
                                ),
                        )
                        .map((field) => field.name);
                    const style =
                        resource.view?.sectionStyle ??
                        resource.editor?.sectionStyle;
                    return (
                        <FormSection
                            key={group.id}
                            title={group.label}
                            description={group.description}
                            hidden={
                                !!activeTab &&
                                !activeTab.groups?.includes(group.id)
                            }
                            variant={style}
                            collapsible={group.collapsible}
                            defaultOpen={group.defaultOpen}
                            summary={group.summary?.(record)}
                            actions={
                                editable && !!editableFields.length ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`${group.label} bearbeiten`}
                                        onClick={() =>
                                            onEdit(record, editableFields)
                                        }
                                    >
                                        <Pencil />
                                    </Button>
                                ) : undefined
                            }
                        >
                            <KeyValueRows
                                items={sectionFields.map((field) => ({
                                    id: field.name,
                                    label: field.label,
                                    value: formatFieldValue(field, record),
                                }))}
                            />
                        </FormSection>
                    );
                })}
                {(!activeTab || activeTab.relations) &&
                    resource.relations?.map((relation) => (
                        <RelationCollection
                            key={relation.resource + relation.field}
                            relation={relation}
                            parent={{ resource: resource.name, id: record.id }}
                            surface="editor"
                            onSaved={refresh}
                        />
                    ))}
            </Stack>
        </Overlay>
    );
}
