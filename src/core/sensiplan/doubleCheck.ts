import { compareISODate } from '../date';
import { ISODate } from '../types';
import { MucusEvaluationResult } from './mucus';
import { TemperatureEvaluationResult } from './temperature';

export interface DoubleCheckEvaluationResult {
  readonly isPostOvulatoryInfertile: boolean;
  readonly infertilePhaseStartDate?: ISODate; // Evening of this date onward
  readonly temperatureConfirmed: boolean;
  readonly mucusConfirmed: boolean;
  readonly ruleId: 'D1_CONFIRMED' | 'D1_PENDING';
  readonly explanation: string;
}

/**
 * Validates Sensiplan Double-Check Rule [D1].
 * The post-ovulatory infertile phase opens ONLY when BOTH temperature shift
 * and mucus peak rules are independently satisfied.
 * It opens on the evening of whichever criterion is completed chronologically later.
 */
export function evaluateDoubleCheck(
  tempResult: TemperatureEvaluationResult,
  mucusResult: MucusEvaluationResult,
  currentDate: ISODate
): DoubleCheckEvaluationResult {
  if (!tempResult.isConfirmed || !mucusResult.isConfirmed) {
    return {
      isPostOvulatoryInfertile: false,
      temperatureConfirmed: tempResult.isConfirmed,
      mucusConfirmed: mucusResult.isConfirmed,
      ruleId: 'D1_PENDING',
      explanation:
        'Çift kontrol henüz tamamlanmadı: Doğurganlık penceresinin kapanması için hem sıcaklık artışının hem de mukus zirvesinin doğrulanması zorunludur.',
    };
  }

  const tDate = tempResult.evaluationCompleteDate!;
  const mDate = mucusResult.evaluationCompleteDate!;

  // Whichever is chronologically later
  const laterDate = compareISODate(tDate, mDate) >= 0 ? tDate : mDate;

  // Has the later confirmation date arrived / passed?
  const isPostInfertile = compareISODate(currentDate, laterDate) >= 0;

  return {
    isPostOvulatoryInfertile: isPostInfertile,
    infertilePhaseStartDate: laterDate,
    temperatureConfirmed: true,
    mucusConfirmed: true,
    ruleId: 'D1_CONFIRMED',
    explanation: `Çift kontrol kuralı (D1) sağlandı: Sıcaklık doğrulaması (${tDate}) ve mukus kuruma doğrulaması (${mDate}) tamamlandı. ${laterDate} akşamından itibaren luteal kısır faz açılmıştır.`,
  };
}
