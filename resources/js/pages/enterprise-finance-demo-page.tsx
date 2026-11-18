import { EnterpriseModule } from "@/framework/tables/enterprise-module";
import { financeDemoConfig } from "@/modules/enterprise-demo/finance-demo";

export default function EnterpriseFinanceDemoPage() {
    return (
        <section
            data-slot="enterprise-finance-demo-page"
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
        >
            <EnterpriseModule config={financeDemoConfig} />
        </section>
    );
}
