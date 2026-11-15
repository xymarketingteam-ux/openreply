-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "languageChoiceEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "languagePromptMessage" TEXT,
ADD COLUMN     "englishButtonLabel" TEXT,
ADD COLUMN     "arabicButtonLabel" TEXT,
ADD COLUMN     "dmMessageAr" TEXT,
ADD COLUMN     "linkButtonLabelAr" TEXT,
ADD COLUMN     "followPromptMessageAr" TEXT,
ADD COLUMN     "followPromptButtonLabelAr" TEXT,
ADD COLUMN     "followUpMessageAr" TEXT;
