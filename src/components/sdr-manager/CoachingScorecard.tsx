import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export interface ScorecardData {
  tone_energy: number;
  discovery_depth: number;
  objection_handling: number;
  value_proposition: number;
  close_next_steps: number;
  active_listening: number;
}

const competencies = [
  { key: 'tone_energy', label: 'Tone & Energy', description: 'Enthusiasm, pacing, confidence' },
  { key: 'discovery_depth', label: 'Discovery Depth', description: 'Quality of questions asked' },
  { key: 'objection_handling', label: 'Objection Handling', description: 'Reframes, empathy, persistence' },
  { key: 'value_proposition', label: 'Value Proposition', description: 'Clarity and relevance of pitch' },
  { key: 'close_next_steps', label: 'Close / Next Steps', description: 'Commitment to next action' },
  { key: 'active_listening', label: 'Active Listening', description: 'Paraphrasing, acknowledgement' },
] as const;

const ratingLabels: Record<number, string> = {
  1: 'Needs Work',
  2: 'Below Avg',
  3: 'Meets',
  4: 'Strong',
  5: 'Excellent',
};

interface CoachingScorecardProps {
  scorecard: ScorecardData;
  onChange: (scorecard: ScorecardData) => void;
  readOnly?: boolean;
}

const CoachingScorecard = ({ scorecard, onChange, readOnly = false }: CoachingScorecardProps) => {
  const handleChange = (key: keyof ScorecardData, value: number[]) => {
    onChange({ ...scorecard, [key]: value[0] });
  };

  const average = Object.values(scorecard).reduce((a, b) => a + b, 0) / Object.values(scorecard).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Call Review Scorecard</Label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Average:</span>
          <span className={`text-sm font-bold ${average >= 4 ? 'text-green-400' : average >= 3 ? 'text-yellow-400' : 'text-red-400'}`}>
            {average.toFixed(1)}/5
          </span>
        </div>
      </div>

      <div className="space-y-5">
        {competencies.map(({ key, label, description }) => (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground ml-2">{description}</span>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                scorecard[key as keyof ScorecardData] >= 4
                  ? 'bg-green-500/20 text-green-400'
                  : scorecard[key as keyof ScorecardData] >= 3
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {ratingLabels[scorecard[key as keyof ScorecardData]] || scorecard[key as keyof ScorecardData]}
              </span>
            </div>
            <Slider
              value={[scorecard[key as keyof ScorecardData]]}
              onValueChange={(v) => handleChange(key as keyof ScorecardData, v)}
              min={1}
              max={5}
              step={1}
              disabled={readOnly}
              className="w-full"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export const defaultScorecard: ScorecardData = {
  tone_energy: 3,
  discovery_depth: 3,
  objection_handling: 3,
  value_proposition: 3,
  close_next_steps: 3,
  active_listening: 3,
};

export default CoachingScorecard;
