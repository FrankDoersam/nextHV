import { EnterpriseModule } from "@/framework/tables/enterprise-module";
import { propertiesDemoConfig } from "@/modules/enterprise-demo/properties-demo";

export default function EnterprisePropertiesDemoPage() {
    return (
        <section
            data-slot="enterprise-properties-demo-page"
            className="flex min-h-0 flex-1 flex-col"
        >
            <EnterpriseModule config={propertiesDemoConfig} />
        </section>
    );
}
