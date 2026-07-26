-- CreateTable
CREATE TABLE "thesis_match_scores" (
    "id" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "queryHash" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "evidence" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thesis_match_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "thesis_match_scores_queryHash_idx" ON "thesis_match_scores"("queryHash");

-- CreateIndex
CREATE UNIQUE INDEX "thesis_match_scores_investorId_queryHash_key" ON "thesis_match_scores"("investorId", "queryHash");

-- AddForeignKey
ALTER TABLE "thesis_match_scores" ADD CONSTRAINT "thesis_match_scores_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
