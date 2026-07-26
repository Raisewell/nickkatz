-- CreateIndex
CREATE UNIQUE INDEX "warm_paths_leadId_targetContactId_key" ON "warm_paths"("leadId", "targetContactId");
