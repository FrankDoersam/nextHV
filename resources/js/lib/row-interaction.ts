/** Keep row navigation separate from in-cell controls, portals and text selection. */
const controls = "a,button,input,textarea,select,summary,[role=button],[role=link],[role=checkbox],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=combobox],[role=switch],[contenteditable=true],[data-row-navigation-ignore]";

export function isRowActivationEvent(event: {
    currentTarget: Element;
    target: EventTarget | null;
}, allowTextSelection = false): boolean {
    const target = event.target as Node | null;
    if (typeof target?.nodeType !== "number" || !event.currentTarget.contains(target))
        return false;
    const element = target.nodeType === 1 ? (target as Element) : target.parentElement;
    if (element?.closest(controls)) return false;
    return allowTextSelection ||
        !event.currentTarget.ownerDocument.defaultView?.getSelection()?.toString();
}
