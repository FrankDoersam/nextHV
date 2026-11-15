import { useI18n } from "@/framework/i18n";
import { ChoicePicker } from "@/components/fields/choice-picker";
export function LanguagePicker() {
    const { locale, setLocale } = useI18n();
    return (
        <ChoicePicker
            aria-label="Sprache / Language"
            value={locale}
            onChange={(value) => setLocale(String(value))}
            options={[
                { value: "de", label: "Deutsch" },
                { value: "en", label: "English" },
            ]}
            clearable={false}
        />
    );
}
