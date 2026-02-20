interface CVViewerProps {
  text: string;
}

const SECTION_KEYWORDS = [
  "esperienza", "experience", "formazione", "education", "istruzione",
  "competenze", "skills", "progetti", "projects", "certificazioni",
  "certifications", "lingue", "languages", "sommario", "summary",
  "profilo", "profile", "contatti", "contact", "pubblicazioni"
];

function isSection(line: string): boolean {
  const lower = line.toLowerCase().trim();
  return SECTION_KEYWORDS.some((kw) => lower === kw || lower.startsWith(kw + " ") || lower.endsWith(" " + kw)) && line.length < 35;
}

function isContact(line: string): boolean {
  return line.includes("@") || line.toLowerCase().includes("linkedin") || /^\+?\d[\d\s\-().]{7,}$/.test(line.trim());
}

function isDate(line: string): boolean {
  return /\d{4}/.test(line) && line.length < 50 && /gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{2}\/\d{2}/i.test(line);
}

// Riunisce righe spezzate: se una riga non termina con punto/due punti
// e la successiva inizia con minuscola, le unisce
function mergeLines(lines: string[]): string[] {
  const merged: string[] = [];
  let buffer = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (buffer) { merged.push(buffer); buffer = ""; }
      continue;
    }

    if (!buffer) {
      buffer = trimmed;
      continue;
    }

    const lastChar = buffer[buffer.length - 1];
    const firstChar = trimmed[0];
    const endsClean = [".", ":", ";", "?", "!"].includes(lastChar);
    const startsLower = firstChar === firstChar.toLowerCase() && /[a-zàèéìòù]/.test(firstChar);
    const isShortContinuation = !endsClean && startsLower && !isSection(trimmed);

    if (isShortContinuation) {
      buffer += " " + trimmed;
    } else {
      merged.push(buffer);
      buffer = trimmed;
    }
  }

  if (buffer) merged.push(buffer);
  return merged;
}

export default function CVViewer({ text }: CVViewerProps) {
  const rawLines = text.split("\n").filter((l) => l.trim().length > 0);
  const lines = mergeLines(rawLines);

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim();

        if (i === 0) {
          return (
            <p key={i} className="text-sm font-bold text-white mb-2">{trimmed}</p>
          );
        }

        if (isSection(trimmed)) {
          return (
            <p key={i} className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mt-3 mb-1 border-b border-gray-700 pb-1">
              {trimmed}
            </p>
          );
        }

        if (isContact(trimmed)) {
          return (
            <p key={i} className="text-xs text-gray-500 italic">{trimmed}</p>
          );
        }

        if (isDate(trimmed)) {
          return (
            <p key={i} className="text-xs text-yellow-600 font-medium">{trimmed}</p>
          );
        }

        return (
          <p key={i} className="text-xs text-gray-400 leading-relaxed">{trimmed}</p>
        );
      })}
    </div>
  );
}