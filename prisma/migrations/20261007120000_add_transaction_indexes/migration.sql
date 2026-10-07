-- CreateIndex
CREATE INDEX "idx_transaction_user" ON "Transaction"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_transaction_paystack_ref" ON "Transaction"("paystackReference");
