import { differenceInDays, addDays, format } from 'date-fns';

// 牛の妊娠期間は約285日
const GESTATION_DAYS = 285;

export function generateAlerts(cattle, breedings, pregnancyChecks, calvings, heats = []) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const alerts = [];

  for (const cow of cattle) {
    const cowBreedings = breedings
      .filter(b => b.cattleId === cow.id)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const cowPCs = pregnancyChecks
      .filter(p => p.cattleId === cow.id)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const cowCalvings = calvings
      .filter(c => c.cattleId === cow.id)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const latestBreeding = cowBreedings[0];
    const latestPC = cowPCs[0];
    const latestCalving = cowCalvings[0];

    if (latestBreeding) {
      const breedingDate = new Date(latestBreeding.date);
      const daysSinceBreeding = differenceInDays(today, breedingDate);

      // 人工授精後の次の発情周期（17〜25日）
      if (daysSinceBreeding >= 17 && daysSinceBreeding <= 25) {
        const isPregnant = latestPC && new Date(latestPC.date) > breedingDate && latestPC.result === '受胎';
        if (!isPregnant) {
          alerts.push({
            type: 'estrus',
            priority: 'high',
            cattleId: cow.id,
            earTag: cow.earTag,
            name: cow.name,
            message: `発情周期（授精後${daysSinceBreeding}日目）- 発情確認してください`,
            date: format(addDays(breedingDate, 21), 'yyyy-MM-dd'),
          });
        }
      }

      // 授精後35日以降 → 妊娠鑑定を記録するまで表示し続ける
      if (daysSinceBreeding >= 33) {
        const hasRecentPC = latestPC && new Date(latestPC.date) > breedingDate;
        if (!hasRecentPC) {
          alerts.push({
            type: 'pregnancy_check',
            priority: 'high',
            cattleId: cow.id,
            earTag: cow.earTag,
            name: cow.name,
            message: `妊娠鑑定時期（授精後${daysSinceBreeding}日目）`,
            date: format(addDays(breedingDate, 35), 'yyyy-MM-dd'),
          });
        }
      }

      // 授精後55-65日で雌雄判別
      if (daysSinceBreeding >= 53 && daysSinceBreeding <= 70) {
        const isPregnant = latestPC && new Date(latestPC.date) > breedingDate && latestPC.result === '受胎';
        if (isPregnant) {
          alerts.push({
            type: 'sex_determination',
            priority: 'medium',
            cattleId: cow.id,
            earTag: cow.earTag,
            name: cow.name,
            message: `雌雄判別時期（授精後${daysSinceBreeding}日目）`,
            date: format(addDays(breedingDate, 60), 'yyyy-MM-dd'),
          });
        }
      }

      // 分娩予定日の2週間前〜分娩を記録するまで表示し続ける
      const isPregnant = latestPC && new Date(latestPC.date) > breedingDate && latestPC.result === '受胎';
      if (isPregnant) {
        const dueDate = addDays(breedingDate, GESTATION_DAYS);
        const daysUntilDue = differenceInDays(dueDate, today);
        const hasCalvingAfterBreeding = latestCalving && new Date(latestCalving.date) > breedingDate;
        if (daysUntilDue <= 14 && !hasCalvingAfterBreeding) {
          const daysLabel = daysUntilDue > 0
            ? `-${daysUntilDue}日`
            : daysUntilDue === 0
            ? `本日`
            : `+${Math.abs(daysUntilDue)}日`;
          const msg = daysUntilDue >= 0
            ? `分娩予定日まであと${daysUntilDue}日（${format(dueDate, 'M/d')}）[${daysLabel}]`
            : `分娩予定日を${Math.abs(daysUntilDue)}日超過（${format(dueDate, 'M/d')}）[${daysLabel}]`;
          alerts.push({
            type: 'calving_due',
            priority: 'high',
            cattleId: cow.id,
            earTag: cow.earTag,
            name: cow.name,
            message: msg,
            date: format(dueDate, 'yyyy-MM-dd'),
          });
        }
      }
    }

    // 分娩後40日経過 → 種付けを記録するまで表示し続ける
    if (latestCalving) {
      const calvingDate = new Date(latestCalving.date);
      const daysSinceCalving = differenceInDays(today, calvingDate);
      const hasBreedingAfterCalving = cowBreedings.some(b => new Date(b.date) > calvingDate);
      if (daysSinceCalving >= 40 && !hasBreedingAfterCalving) {
        alerts.push({
          type: 'post_calving',
          priority: 'medium',
          cattleId: cow.id,
          earTag: cow.earTag,
          name: cow.name,
          message: `分娩後${daysSinceCalving}日経過 - 種付開始可能`,
          date: format(addDays(calvingDate, 40), 'yyyy-MM-dd'),
        });
      }
    }

    // 次回発情予定（発情記録はあるが未授精の牛、発情後17〜25日）
    const cowHeats = heats
      .filter(h => h.cattleId === cow.id)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const latestHeat = cowHeats[0];
    if (latestHeat) {
      const heatDate = new Date(latestHeat.date);
      const daysSinceHeat = differenceInDays(today, heatDate);
      // 発情後に種付けされていない場合のみ表示
      const hasBreedingAfterHeat = cowBreedings.some(b => new Date(b.date) >= heatDate);
      if (daysSinceHeat >= 17 && daysSinceHeat <= 25 && !hasBreedingAfterHeat) {
        alerts.push({
          type: 'next_estrus',
          priority: 'high',
          cattleId: cow.id,
          earTag: cow.earTag,
          name: cow.name,
          message: `次回発情予定（前回発情から${daysSinceHeat}日目）`,
          date: format(addDays(heatDate, 21), 'yyyy-MM-dd'),
        });
      }
    }

    // 長期不受胎牛（最後の分娩から120日以上経過で受胎していない）
    if (latestCalving) {
      const calvingDate = new Date(latestCalving.date);
      const daysSinceCalving = differenceInDays(today, calvingDate);
      const isCurrentlyPregnant = latestPC && latestBreeding &&
        new Date(latestPC.date) > new Date(latestBreeding.date) &&
        new Date(latestBreeding.date) > calvingDate &&
        latestPC.result === '受胎';
      if (daysSinceCalving > 120 && !isCurrentlyPregnant) {
        alerts.push({
          type: 'long_open',
          priority: 'low',
          cattleId: cow.id,
          earTag: cow.earTag,
          name: cow.name,
          message: `長期不受胎（分娩後${daysSinceCalving}日経過）`,
          date: format(calvingDate, 'yyyy-MM-dd'),
        });
      }
    }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  return alerts;
}
