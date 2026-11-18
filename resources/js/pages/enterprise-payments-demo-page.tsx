import { EnterpriseModule } from "@/framework/tables/enterprise-module";
import { EnterpriseDemoHeader } from "@/modules/enterprise-demo/demo-shared";
import { paymentsDemoConfig } from "@/modules/enterprise-demo/payments-demo";

export default function EnterprisePaymentsDemoPage() {
    return (
        <section
            data-slot="enterprise-payments-demo-page"
            className="flex min-w-0 flex-col gap-6"
        >
            <EnterpriseDemoHeader kind="payments" />
            <EnterpriseModule config={paymentsDemoConfig} />
        </section>
    );
}
