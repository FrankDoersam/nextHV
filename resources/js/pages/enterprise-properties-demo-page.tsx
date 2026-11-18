import { EnterpriseModule } from "@/framework/tables/enterprise-module";
import { EnterpriseDemoHeader } from "@/modules/enterprise-demo/demo-shared";
import { propertiesDemoConfig } from "@/modules/enterprise-demo/properties-demo";

export default function EnterprisePropertiesDemoPage() {
    return (
        <section
            data-slot="enterprise-properties-demo-page"
            className="flex min-w-0 flex-col gap-6"
        >
            <EnterpriseDemoHeader kind="properties" />
            <EnterpriseModule config={propertiesDemoConfig} />
        </section>
    );
}
