import { db } from '../db/database';

// Excelから取得した全頭データ
const CATTLE_DATA = [
  { earTag: '1109(80.5)', birthDate: '2005-07-13', name: '83', father: '', individualId: '1215054956' },
  { earTag: '1125(81.6)', birthDate: '2007-04-18', name: 'セ3', father: '', individualId: '1204166929' },
  { earTag: '1133(80.0)', birthDate: '2007-08-08', name: 'セ67', father: '', individualId: '1204166936' },
  { earTag: '1134(80.4)', birthDate: '2007-08-24', name: 'セ69', father: '', individualId: '1204166943' },
  { earTag: '1136(79.0)', birthDate: '2007-10-23', name: 'セ8', father: '', individualId: '0240293866' },
  { earTag: '1138(82.0)', birthDate: '2008-01-15', name: '1049', father: '', individualId: '1240504303' },
  { earTag: 'じゅんこ(77.0)', birthDate: '2008-05-19', name: '', father: '', individualId: '1247417309' },
  { earTag: '1147(81.6)', birthDate: '2008-06-08', name: '1052', father: '', individualId: '0247877045' },
  { earTag: '1154(78.4)', birthDate: '2008-11-22', name: '83', father: '', individualId: '0247877199' },
  { earTag: '1158(78.1)', birthDate: '2009-01-21', name: '1126', father: '', individualId: '0247877175' },
  { earTag: '1165(80.3)', birthDate: '2009-05-29', name: '1061', father: '', individualId: '1254221562' },
  { earTag: '1173(79.6)', birthDate: '2009-12-15', name: '1124', father: '', individualId: '1258815842' },
  { earTag: '1175(79.3)', birthDate: '2010-02-11', name: '1109', father: '', individualId: '1258815736' },
  { earTag: '1178(80.5)', birthDate: '2010-04-01', name: '1104', father: '', individualId: '1260147894' },
  { earTag: '1179(81.4)', birthDate: '2010-05-08', name: '1047', father: '', individualId: '1260147900' },
  { earTag: '1190(80.0)', birthDate: '2010-10-08', name: '1039', father: '', individualId: '1303139077' },
  { earTag: '1207(79.6)', birthDate: '2011-07-01', name: '1042', father: '', individualId: '1303139336' },
  { earTag: '1214(80.0)', birthDate: '2012-01-14', name: '1178', father: '', individualId: '1341039513' },
  { earTag: '1232(77.6)', birthDate: '2013-02-23', name: '1161', father: '', individualId: '1341039933' },
  { earTag: '1245', birthDate: '2014-03-13', name: '1147', father: '', individualId: '1457240285' },
  { earTag: '1263', birthDate: '2015-01-17', name: '1140', father: '', individualId: '1488640658' },
  { earTag: 'りん(80.0)', birthDate: '2005-01-20', name: '', father: '', individualId: '1205413398' },
  { earTag: '1104(80.1)', birthDate: '2005-05-21', name: '85', father: '', individualId: '1215054833' },
  { earTag: '1122(80.0)', birthDate: '2007-03-16', name: 'セ68', father: '', individualId: '1204166912' },
  { earTag: '1137(81.7)', birthDate: '2007-11-05', name: '83', father: '', individualId: '1247330387' },
  { earTag: '1140(82.2)', birthDate: '2008-02-09', name: 'セ11', father: '', individualId: '1247330318' },
  { earTag: '1141(81.3)', birthDate: '2008-03-01', name: 'セ9', father: '', individualId: '1247330332' },
  { earTag: 'ももこ(81.6)', birthDate: '2008-05-29', name: '', father: '', individualId: '1247417316' },
  { earTag: '1161(80.5)', birthDate: '2009-04-19', name: 'セ21', father: '', individualId: '1254221494' },
  { earTag: '1166(79.5)', birthDate: '2009-07-05', name: '1021', father: '', individualId: '1254221609' },
  { earTag: '1176(81.1)', birthDate: '2010-02-28', name: '1134', father: '', individualId: '1258815743' },
  { earTag: '1177(81.1)', birthDate: '2010-03-01', name: '1036', father: '', individualId: '1258815750' },
  { earTag: '1180(81.3)', birthDate: '2010-06-08', name: 'セ54', father: '', individualId: '1260147924' },
  { earTag: '1188(80.5)', birthDate: '2010-10-07', name: '1084', father: '', individualId: '1260739051' },
  { earTag: '1194(82.0)', birthDate: '2010-11-26', name: '1140', father: '', individualId: '1303139138' },
  { earTag: '1202(82.1)', birthDate: '2011-05-29', name: '1136', father: '', individualId: '1303139282' },
  { earTag: '1209(80.2)', birthDate: '2011-08-05', name: '54', father: '', individualId: '1303139367' },
  { earTag: '1210(79.3)', birthDate: '2011-08-19', name: '1044', father: '', individualId: '1341039377' },
  { earTag: 'なみ(80.2)', birthDate: '2011-08-24', name: '', father: '', individualId: '1302594426' },
  { earTag: '1213(80.3)', birthDate: '2011-11-12', name: '1176', father: '', individualId: '1341039452' },
  { earTag: '1215(81.0)', birthDate: '2012-02-06', name: '1177', father: '', individualId: '1341039544' },
  { earTag: '1217(82.0)', birthDate: '2012-03-25', name: '1104', father: '', individualId: '1341039582' },
  { earTag: '1223(81.1)', birthDate: '2012-06-10', name: '1138', father: '', individualId: '1341039698' },
  { earTag: '1230(80.7)', birthDate: '2013-01-04', name: '1194', father: '', individualId: '1341039889' },
  { earTag: '1231(80.7)', birthDate: '2013-01-13', name: '1178', father: '', individualId: '1341039896' },
  { earTag: '1233(82.7)', birthDate: '2013-05-17', name: '1180', father: '', individualId: '1341039971' },
  { earTag: '1234(78.6)', birthDate: '2013-05-22', name: '1209', father: '', individualId: '1341039988' },
  { earTag: '1236(81.8)', birthDate: '2013-06-30', name: '1134', father: '', individualId: '1350140071' },
  { earTag: '1242(81.7)', birthDate: '2013-10-22', name: '1137', father: '', individualId: '1350140194' },
  { earTag: '1244(80.7)', birthDate: '2014-01-30', name: 'ももこ', father: '', individualId: '1457240278' },
  { earTag: '1246(81.4)', birthDate: '2014-03-28', name: '1215', father: '', individualId: '1457240292' },
  { earTag: '1247(83.4)', birthDate: '2014-04-11', name: '1177', father: '', individualId: '1457240308' },
  { earTag: '1253(80.7)', birthDate: '2014-08-11', name: '1134', father: '', individualId: '1457240476' },
  { earTag: '1258(79.8)', birthDate: '2014-11-08', name: '1188', father: '', individualId: '1457240575' },
  { earTag: '1259(80.1)', birthDate: '2014-11-19', name: '1109', father: '', individualId: '1457240599' },
  { earTag: '1264(81.0)', birthDate: '2015-01-21', name: 'りん', father: '', individualId: '1488640665' },
  { earTag: '1268(80.5)', birthDate: '2015-04-15', name: '1223', father: '', individualId: '1488640771' },
  { earTag: '1272(80.3)', birthDate: '2015-06-17', name: '1209', father: '', individualId: '1488640832' },
  { earTag: '1275(79.5)', birthDate: '2015-08-30', name: 'ももこ', father: '', individualId: '1509702259' },
  { earTag: '1278(81.0)', birthDate: '2015-10-12', name: '1175', father: '', individualId: '1488640917' },
  { earTag: '1285(80.7)', birthDate: '2016-02-09', name: '1177', father: '', individualId: '1508941048' },
  { earTag: '1297(82.0)', birthDate: '2016-09-26', name: '1176', father: '', individualId: '1508941314' },
  { earTag: '1298(82.8)', birthDate: '2016-09-30', name: '1190', father: '', individualId: '1508941321' },
  { earTag: '1309', birthDate: '2017-06-15', name: '1141', father: '', individualId: '1537141655' },
  { earTag: '1320', birthDate: '2017-11-04', name: '1258', father: '', individualId: '1537141815' },
  { earTag: '1332', birthDate: '2018-04-02', name: 'りん', father: '', individualId: '1416541989' },
  { earTag: '1284(81.8)', birthDate: '2016-02-04', name: 'りん', father: '', individualId: '1508941031' },
  { earTag: '1295(82.0)', birthDate: '2016-07-29', name: '1188', father: '', individualId: '1508941239' },
  { earTag: '1299', birthDate: '2016-10-18', name: 'ももこ', father: '', individualId: '1508941352' },
  { earTag: '1300(82.3)', birthDate: '2016-11-05', name: '1258', father: '', individualId: '1508941369' },
  { earTag: '1307', birthDate: '2017-04-12', name: '1207', father: '', individualId: '1537141600' },
  { earTag: '1312', birthDate: '2017-07-19', name: '1188', father: '', individualId: '1537141709' },
  { earTag: '1313', birthDate: '2017-07-30', name: '1104', father: '', individualId: '1537141716' },
  { earTag: '1314', birthDate: '2017-08-04', name: '1134', father: '', individualId: '1537141723' },
  { earTag: '1319', birthDate: '2017-10-13', name: '1180', father: '', individualId: '1537141808' },
  { earTag: '1326', birthDate: '2018-02-02', name: '1147', father: '', individualId: '1416541903' },
  { earTag: '1333', birthDate: '2018-04-05', name: 'ももこ', father: '', individualId: '1416541996' },
  { earTag: '1336', birthDate: '2018-04-18', name: '1194', father: '', individualId: '1536042052' },
  { earTag: '1337', birthDate: '2018-05-21', name: '1233', father: '', individualId: '1536042076' },
  { earTag: '1346', birthDate: '2018-11-08', name: '1180', father: '', individualId: '1412742298' },
  { earTag: '1347', birthDate: '2018-11-09', name: '1298', father: '', individualId: '1412742304' },
  { earTag: '1351', birthDate: '2019-02-11', name: '1247', father: '', individualId: '1412742403' },
  { earTag: '1353', birthDate: '2019-03-12', name: '1242', father: '', individualId: '1412742427' },
  { earTag: '1354', birthDate: '2019-03-13', name: 'ももこ', father: '', individualId: '1412742434' },
  { earTag: '1365', birthDate: '2019-08-22', name: '1295', father: '', individualId: '1509342646' },
  { earTag: '1367', birthDate: '2019-10-08', name: '1268', father: '', individualId: '1509342738' },
  { earTag: '1376', birthDate: '2020-03-22', name: '1194', father: '', individualId: '1601842891' },
  { earTag: '1377', birthDate: '2020-04-07', name: '1312', father: '', individualId: '1601842921' },
  { earTag: '1380', birthDate: '2020-07-31', name: '1295', father: '美津照重', individualId: '1601843003' },
  { earTag: '1381', birthDate: '2020-08-01', name: '1346', father: '葵白清', individualId: '1606143016' },
  { earTag: '1382', birthDate: '2020-12-07', name: '1259', father: '徳悠翔', individualId: '1606143122' },
  { earTag: '1383', birthDate: '2020-12-20', name: '1180', father: '美津照重', individualId: '1370943140' },
  { earTag: '1384', birthDate: '2021-01-30', name: '1236', father: 'ET:安森照', individualId: '1370943195' },
  { earTag: '1386', birthDate: '2021-03-30', name: '1284', father: '愛乃国', individualId: '1370943263' },
  { earTag: '1388', birthDate: '2021-04-09', name: '1202', father: 'ET:福之姫', individualId: '1370943287' },
  { earTag: 'ちよ', birthDate: '2021-05-02', name: 'おしず', father: '満天白清', individualId: '1422083442' },
  { earTag: '1391', birthDate: '2021-05-21', name: '1258', father: '福増', individualId: '1370943362' },
  { earTag: '1395', birthDate: '2021-06-14', name: '1353', father: '美津百合', individualId: '1370943393' },
  { earTag: '1399', birthDate: '2021-08-11', name: '1295', father: '福之姫', individualId: '1559943503' },
  { earTag: '1400', birthDate: '2021-10-13', name: '1188', father: '美津百合', individualId: '1559943541' },
  { earTag: '1405', birthDate: '2021-12-12', name: '1300', father: '久茂福', individualId: '1559943619' },
  { earTag: '1410', birthDate: '2022-04-20', name: '1284', father: '福之姫', individualId: '1559943732' },
  { earTag: '1411', birthDate: '2022-04-23', name: '1258', father: '芳乃国', individualId: '1559943749' },
  { earTag: '1413', birthDate: '2022-05-07', name: '1233', father: '幸忠栄', individualId: '1559943763' },
  { earTag: '1414', birthDate: '2022-05-26', name: '1234', father: '貴隼桜', individualId: '1559943794' },
  { earTag: '1418', birthDate: '2022-07-12', name: '1353', father: '秋忠平', individualId: '1633143867' },
  { earTag: '1419', birthDate: '2022-07-14', name: '1346', father: '貴隼桜', individualId: '1633143874' },
  { earTag: '1420', birthDate: '2022-07-15', name: '1268', father: '茂晴花', individualId: '1633143881' },
  { earTag: '1422', birthDate: '2022-07-20', name: '1264', father: '繫百合', individualId: '1633143904' },
  { earTag: '1423', birthDate: '2022-08-03', name: '1295', father: '知恵久', individualId: '1633143928' },
  { earTag: '1425', birthDate: '2022-08-31', name: 'なみ', father: '知恵久', individualId: '1633143959' },
  { earTag: '1427', birthDate: '2022-10-14', name: '1376', father: '加代白清', individualId: '1633143997' },
  { earTag: '1428', birthDate: '2022-10-20', name: '1354', father: '福華1', individualId: '1633144000' },
  { earTag: '1430', birthDate: '2022-12-10', name: '1312', father: '福之姫', individualId: '1668444045' },
  { earTag: '1432', birthDate: '2023-02-03', name: '1336', father: '繫百合', individualId: '1668444090' },
  { earTag: '1437', birthDate: '2023-04-18', name: '1284', father: '福之姫', individualId: '1673344217' },
  { earTag: '1438', birthDate: '2023-04-19', name: '1375', father: '貴隼桜', individualId: '1673344224' },
  { earTag: '1449', birthDate: '2023-12-16', name: '1307', father: '秋忠平', individualId: '1381444520' },
  { earTag: '1451', birthDate: '2024-01-14', name: '1312', father: '福之姫', individualId: '1381444568' },
];

/**
 * Excelデータをアプリのデータベースに反映
 * 耳標が一致する牛のデータを更新する
 */
export async function applyExcelData() {
  let updated = 0;
  for (const data of CATTLE_DATA) {
    // 耳標で検索（完全一致、または数字部分一致）
    let cattle = await db.cattle.where('earTag').equals(data.earTag).first();
    if (!cattle) {
      // 数字部分だけで検索
      const num = data.earTag.match(/^\d+/)?.[0];
      if (num) {
        const allCattle = await db.cattle.toArray();
        cattle = allCattle.find(c => c.earTag && c.earTag.startsWith(num));
      }
    }
    if (!cattle) continue;

    const updateData = {};
    if (data.birthDate && !cattle.birthDate) updateData.birthDate = data.birthDate;
    if (data.father && !cattle.father) updateData.father = data.father;
    if (data.individualId && !cattle.individualId) updateData.individualId = data.individualId;
    // nameはExcelでは母牛名なので、cattle.nameが空の場合のみ母牛として保存
    if (data.name && !cattle.motherName) updateData.motherName = data.name;

    if (Object.keys(updateData).length > 0) {
      await db.cattle.update(cattle.id, updateData);
      updated++;
    }
  }
  return updated;
}
