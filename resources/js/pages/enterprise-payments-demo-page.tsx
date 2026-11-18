import { EnterpriseModule } from "@/framework/tables/enterprise-module";
import { paymentsDemoConfig } from "@/modules/enterprise-demo/payments-demo";

export default function EnterprisePaymentsDemoPage() {
    return (
        <section
            data-slot="enterprise-payments-demo-page"
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
        >
            <EnterpriseModule config={paymentsDemoConfig} />
        </section>
    );
}
