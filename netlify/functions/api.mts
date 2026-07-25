import type { Config } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";
import { readFile } from "node:fs/promises";
import path from "node:path";

type Product = {
  gender: string;
  category: string;
  subcategory: string;
  size: string;
  brand: string;
  min_price: number;
  max_price: number;
  rating: number;
  score?: number;
};

type Filters = {
  gender?: string;
  category?: string;
  subcategory?: string;
  size?: string;
  brand?: string;
  min_price?: string | number;
  max_price?: string | number;
  min_rating?: string | number;
};

const model = "gemini-3-flash-preview";
const systemInstruction = [
  "You are a professional fashion assistant.",
  "Never use emojis.",
  "Always respond in numbered steps.",
  "Keep each step concise and factual.",
  "Use plain text without Markdown formatting.",
].join(" ");

async function loadProducts(): Promise<Product[]> {
  const csvPath = path.join(process.cwd(), "backend", "products.csv");
  const csv = await readFile(csvPath, "utf8");
  const [headerLine, ...rows] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(",");

  return rows.map((row) => {
    const values = row.split(",");
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));

    return {
      gender: record.gender,
      category: record.category,
      subcategory: record.subcategory,
      size: record.size,
      brand: record.brand,
      min_price: Number(record.min_price),
      max_price: Number(record.max_price),
      rating: Number(record.rating),
    };
  });
}

function applyFilters(products: Product[], filters: Filters): Product[] {
  return products.filter((product) => {
    const equals = (value: string, filter?: string) => !filter || value.toLowerCase() === filter.toLowerCase();
    const categoryMatches = !filters.category
      || product.category.toLowerCase() === filters.category.toLowerCase()
      || product.subcategory.toLowerCase() === filters.category.toLowerCase();
    const minimumPrice = filters.min_price === undefined || filters.min_price === "" ? undefined : Number(filters.min_price);
    const maximumPrice = filters.max_price === undefined || filters.max_price === "" ? undefined : Number(filters.max_price);
    const minimumRating = filters.min_rating === undefined || filters.min_rating === "" ? undefined : Number(filters.min_rating);

    return equals(product.gender, filters.gender)
      && categoryMatches
      && equals(product.subcategory, filters.subcategory)
      && equals(product.brand, filters.brand)
      && equals(product.size, filters.size)
      && (minimumPrice === undefined || product.max_price >= minimumPrice)
      && (maximumPrice === undefined || product.min_price <= maximumPrice)
      && (minimumRating === undefined || product.rating >= minimumRating);
  });
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

async function generateText(contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"]): Promise<string> {
  const ai = new GoogleGenAI({});
  const response = await ai.models.generateContent({
    model,
    contents,
    config: { systemInstruction },
  });

  return response.text?.trim() || "";
}

function parseTips(text: string): { pro_tip: string; disadvantage: string } {
  const tip = text.match(/TIP:\s*(.*?)(?=LIMITATION:|$)/is)?.[1]?.trim();
  const limitation = text.match(/LIMITATION:\s*(.*?)$/is)?.[1]?.trim();

  return {
    pro_tip: tip || "Pair this item with complementary colors and balanced proportions.",
    disadvantage: limitation || "Follow the care label to preserve its fit and appearance.",
  };
}

export default async (request: Request): Promise<Response> => {
  const action = new URL(request.url).pathname.split("/").filter(Boolean).at(-1);

  try {
    if (action === "filters" && request.method === "GET") {
      const products = await loadProducts();
      const unique = (key: keyof Product) => [...new Set(products.map((product) => String(product[key])))].sort();
      const subcategoryMap = Object.fromEntries(
        ["male", "female", "unisex"].map((gender) => [
          gender,
          [...new Set(products.filter((product) => product.gender.toLowerCase() === gender).map((product) => product.subcategory))].sort(),
        ]),
      );

      return json({
        gender: unique("gender"),
        category: unique("category"),
        subcategory: unique("subcategory"),
        size: unique("size"),
        brand: unique("brand"),
        subcategory_map: subcategoryMap,
      });
    }

    if (action === "search-products" && request.method === "POST") {
      const filters = await request.json() as Filters;
      const products = applyFilters(await loadProducts(), filters);
      const maximumMidPrice = Math.max(...products.map((product) => (product.min_price + product.max_price) / 2), 1);
      const scoredProducts = products.map((product) => ({
        ...product,
        score: product.rating * 0.5 + (100 - (((product.min_price + product.max_price) / 2) / maximumMidPrice) * 100) * 0.3 + 20,
      }));

      return json({
        success: true,
        count: scoredProducts.length,
        products: scoredProducts,
        filters_applied: filters,
      });
    }

    if (action === "chat" && request.method === "POST") {
      const { message } = await request.json() as { message?: string };
      if (!message?.trim()) return json({ reply: "Please provide a message." }, 400);
      return json({ reply: await generateText(message) });
    }

    if (action === "get-tips" && request.method === "POST") {
      const data = await request.json() as { product_name?: string; details?: string; event_type?: string };
      const prompt = `For ${data.product_name || "this product"} (${data.details || "no details"}) for ${data.event_type || "general"} occasions, provide exactly one styling tip and one realistic limitation. Format the response as TIP: ... followed by LIMITATION: ...`;
      return json(parseTips(await generateText(prompt)));
    }

    if (action === "analyze-image" && request.method === "POST") {
      const formData = await request.formData();
      const file = formData.get("file");
      const prompt = String(formData.get("prompt") || "Give a concise fashion analysis.");
      if (!(file instanceof File)) return json({ analysis: "Please upload an image." }, 400);

      const data = Buffer.from(await file.arrayBuffer()).toString("base64");
      const analysis = await generateText([{
        role: "user",
        parts: [
          { text: `${prompt}\nDescribe the outfit, assess its style, suggest improvements, and name suitable occasions.` },
          { inlineData: { mimeType: file.type || "image/jpeg", data } },
        ],
      }]);

      return json({ analysis });
    }

    return json({ error: "Endpoint not found." }, 404);
  } catch (error) {
    console.error("API request failed", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "The API request could not be completed. Please try again." }, 500);
  }
};

export const config: Config = {
  path: "/api/*",
};
