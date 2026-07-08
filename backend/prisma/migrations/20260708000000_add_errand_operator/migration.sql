-- AlterTable
ALTER TABLE "errands" ADD COLUMN     "operatorId" TEXT;

-- CreateIndex
CREATE INDEX "errands_operatorId_idx" ON "errands"("operatorId");

