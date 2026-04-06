// Type declarations for optional x402 dependencies.
// These packages are dynamically imported at runtime only when X402_PRIVATE_KEY is set.

declare module "x402" {
  export function wrapFetchWithPayment(
    fetchFn: typeof fetch,
    options: { privateKey: string; network?: string },
  ): typeof fetch

  export function createPaymentHeader(
    paymentRequired: unknown,
    privateKey: string,
    network?: string,
  ): Promise<string>
}

declare module "@x402/core" {
  export function createPaymentHeader(
    paymentRequired: unknown,
    privateKey: string,
  ): Promise<string>
}
