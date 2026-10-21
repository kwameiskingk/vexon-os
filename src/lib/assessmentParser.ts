// Utility to parse assessment data into structured Q&A pairs

export interface QAPair {
  question: string;
  answer: string;
}

// Fields to skip (already shown in Candidate Info card)
const SKIP_FIELDS = [
  'name',
  'full name',
  'email',
  'phone number',
  'phone',
  'role applied',
  'role',
];

// Pattern matching for inferring unlabeled question types
const INFER_PATTERNS: Array<{ match: RegExp; label: string }> = [
  { match: /^\d{4}-\d{2}-\d{2}$/, label: 'Date of Birth' },
  { match: /^(19|20)\d{2}-\d{2}-\d{2}$/, label: 'Date of Birth' },
  { match: /differences? in the addresses?/i, label: 'Address Differences' },
  { match: /^\d+\s*words?$/i, label: 'Word Count' },
  { match: /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i, label: 'Day of Week' },
  { match: /differences? between Statement/i, label: 'Statement Comparison' },
  { match: /^(Silence|Conversation)$/i, label: 'Audio Response' },
  { match: /^\d+$/, label: 'Numeric Answer' },
  { match: /^(True|False)$/i, label: 'True/False Question' },
  { match: /^(Yes|No)$/i, label: 'Yes/No Question' },
  { match: /^(for|will see|have seen|arrived|was talking|have talked)$/i, label: 'Grammar Question' },
  { match: /^".*"$/s, label: 'Scenario Response' },
  { match: /movie ended at/i, label: 'Time Calculation' },
  { match: /David/i, label: 'Reading Comprehension' },
  { match: /hours? long/i, label: 'Duration Question' },
];

function inferQuestionLabel(answer: string, index: number): string {
  const trimmedAnswer = answer.trim();
  
  for (const pattern of INFER_PATTERNS) {
    if (pattern.match.test(trimmedAnswer)) {
      return pattern.label;
    }
  }
  
  // Generic fallback
  return `Additional Question #${index + 1}`;
}

function shouldSkipField(question: string): boolean {
  const normalizedQuestion = question.toLowerCase().trim();
  return SKIP_FIELDS.some(field => normalizedQuestion.includes(field));
}

export function parseAssessmentToQA(prettyText: string | null): QAPair[] {
  if (!prettyText || prettyText.trim() === '') {
    return [];
  }

  const lines = prettyText.split('\n').filter(line => line.trim() !== '');
  const results: QAPair[] = [];
  let unlabeledIndex = 0;

  for (const line of lines) {
    // Find the first colon to split question and answer
    const colonIndex = line.indexOf(':');
    
    if (colonIndex === -1) {
      // No colon found, treat entire line as an answer with inferred question
      const answer = line.trim();
      if (answer) {
        results.push({
          question: inferQuestionLabel(answer, unlabeledIndex++),
          answer,
        });
      }
      continue;
    }

    let question = line.substring(0, colonIndex).trim();
    const answer = line.substring(colonIndex + 1).trim();

    // Skip empty answers
    if (!answer) continue;

    // Skip contact fields (already shown in header)
    if (question && shouldSkipField(question)) {
      continue;
    }

    // If question is empty, infer it from the answer
    if (!question) {
      question = inferQuestionLabel(answer, unlabeledIndex++);
    }

    results.push({ question, answer });
  }

  return results;
}

// Parse assessment_payload if it has structured data
export function parsePayloadToQA(payload: Record<string, unknown> | null): QAPair[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  // Check if payload has a 'raw' object
  const rawData = (payload.raw as Record<string, unknown>) || payload;
  
  const results: QAPair[] = [];
  let unlabeledIndex = 0;

  for (const [key, value] of Object.entries(rawData)) {
    // Skip metadata fields
    if (key.startsWith('Raw Request') || key === 'rawRequest') continue;
    if (key.includes('Event') || key.includes('Build') || key.includes('Tracker')) continue;
    
    const answer = String(value || '').trim();
    if (!answer) continue;

    // Clean up question key
    let question = key
      .replace(/^q\d+_?/i, '') // Remove q123_ prefix
      .replace(/([A-Z])/g, ' $1') // Add space before capitals
      .replace(/_/g, ' ')
      .trim();

    // Skip contact fields
    if (shouldSkipField(question)) continue;

    // If question is empty after cleaning, infer it
    if (!question) {
      question = inferQuestionLabel(answer, unlabeledIndex++);
    }

    results.push({ question, answer });
  }

  return results;
}
