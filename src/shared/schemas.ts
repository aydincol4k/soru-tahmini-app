import { z } from "zod";

export const CikmisSoruAnaliziSchema = z.object({
  topics: z.array(
    z.object({
      name: z.string(),
      frequency: z.number(),
      difficulty: z.enum(["kolay", "orta", "zor"]).optional(),
      sampleQuestions: z.array(z.string()).default([]),
      keywords: z.array(z.string()).default([]),
    }),
  ),
  patterns: z.array(z.string()).default([]),
  hotpoints: z.array(
    z.object({
      topic: z.string(),
      reason: z.string(),
      score: z.number().min(0).max(1),
    }),
  ),
  notes: z.string().optional(),
});
export type CikmisSoruAnalizi = z.infer<typeof CikmisSoruAnaliziSchema>;

export const SlaytKonuHaritasiSchema = z.object({
  source: z.string(),
  slides: z.array(
    z.object({
      page: z.number(),
      title: z.string(),
      concepts: z.array(z.string()).default([]),
      formulas: z.array(z.string()).default([]),
      examples: z.array(z.string()).default([]),
    }),
  ),
  topicGraph: z.array(
    z.object({
      topic: z.string(),
      related: z.array(z.string()).default([]),
      weight: z.number().min(0).max(1).default(0.5),
    }),
  ),
});
export type SlaytKonuHaritasi = z.infer<typeof SlaytKonuHaritasiSchema>;

export const ElNotuKonuHaritasiSchema = z.object({
  source: z.string(),
  emphasized: z.array(
    z.object({
      page: z.number(),
      text: z.string(),
      emphasisType: z.enum(["alti-cizili", "kutulu", "yildizli", "ibare", "diger"]),
      confidence: z.number().min(0).max(1),
    }),
  ),
  topics: z.array(
    z.object({
      topic: z.string(),
      emphasisScore: z.number().min(0).max(1),
      notes: z.string().optional(),
    }),
  ),
});
export type ElNotuKonuHaritasi = z.infer<typeof ElNotuKonuHaritasiSchema>;

export const SentezSchema = z.object({
  topics: z.array(
    z.object({
      topic: z.string(),
      priorityScore: z.number().min(0).max(1),
      cikmisSoruFrekansi: z.number().default(0),
      slaytAgirligi: z.number().min(0).max(1).default(0),
      notVurgusu: z.number().min(0).max(1).default(0),
      gerekceler: z.array(z.string()).default([]),
    }),
  ),
  overallSummary: z.string().optional(),
});
export type Sentez = z.infer<typeof SentezSchema>;

export const TahminSoruSchema = z.object({
  no: z.number(),
  soru: z.string(),
  zorluk: z.enum(["kolay", "orta", "zor"]),
  kaynakKonu: z.string(),
  tahminGerekcesi: z.string(),
  cevapAnahtari: z.string().optional(),
});
export const TahminSorulariSchema = z.object({
  dersAdi: z.string(),
  uretimTarihi: z.string(),
  sorular: z.array(TahminSoruSchema),
});
export type TahminSorular = z.infer<typeof TahminSorulariSchema>;
export type TahminSoru = z.infer<typeof TahminSoruSchema>;
