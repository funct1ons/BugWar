// Approved v2 cover illustration. Regenerates public/art/cover.svg byte for byte.
// Original coordinate-built curves; no source artwork, font or external asset.
const fs=require('fs'); const path=require('path');
let s=[]; const add=x=>s.push(x);
add(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><defs>
<linearGradient id="air" x2=".8" y2="1"><stop stop-color="#fff9e8"/><stop offset=".55" stop-color="#e8f6f6"/><stop offset="1" stop-color="#dceace"/></linearGradient>
<radialGradient id="sun"><stop stop-color="#fffef1"/><stop offset="1" stop-color="#fffbea" stop-opacity="0"/></radialGradient>
<linearGradient id="ground" x2="0.2" y2="1"><stop stop-color="#e4eab7"/><stop offset="1" stop-color="#a1b780"/></linearGradient>
<linearGradient id="wood" x1="0" y1="0" x2=".25" y2="1"><stop stop-color="#e3cb94"/><stop offset=".35" stop-color="#b7a170"/><stop offset=".75" stop-color="#877753"/><stop offset="1" stop-color="#626645"/></linearGradient>
<linearGradient id="leaf" x2=".7" y2="1"><stop stop-color="#e0efa4"/><stop offset=".4" stop-color="#8ebe72"/><stop offset="1" stop-color="#3f8057"/></linearGradient>
<linearGradient id="darkLeaf" x2=".7" y2="1"><stop stop-color="#54865c"/><stop offset="1" stop-color="#163f35"/></linearGradient>
<radialGradient id="blue" cx=".28" cy=".18" r=".9"><stop stop-color="#9DD7ED"/><stop offset=".42" stop-color="#4797C7"/><stop offset=".8" stop-color="#28678f"/><stop offset="1" stop-color="#21547B"/></radialGradient>
<linearGradient id="blueLight" x2=".8" y2="1"><stop stop-color="#d6f1f4"/><stop offset=".4" stop-color="#78c3df"/><stop offset="1" stop-color="#316a96"/></linearGradient>
<radialGradient id="red" cx=".24" cy=".18" r=".95"><stop stop-color="#F0AC76"/><stop offset=".42" stop-color="#D36749"/><stop offset=".8" stop-color="#a34838"/><stop offset="1" stop-color="#8E3E34"/></radialGradient>
<linearGradient id="redLight" x2=".7" y2="1"><stop stop-color="#ffd6a0"/><stop offset=".45" stop-color="#e99060"/><stop offset="1" stop-color="#a34b36"/></linearGradient>
<linearGradient id="joint" x2=".8" y2="1"><stop stop-color="#b29572"/><stop offset=".36" stop-color="#67564b"/><stop offset="1" stop-color="#342f2e"/></linearGradient>
<radialGradient id="eye" cx=".35" cy=".25"><stop stop-color="#58737b"/><stop offset=".35" stop-color="#243b46"/><stop offset="1" stop-color="#10252e"/></radialGradient>
<linearGradient id="blade" x2=".7" y2="1"><stop stop-color="#f4ffe1"/><stop offset=".4" stop-color="#c8eab1"/><stop offset=".52" stop-color="#73a782"/><stop offset="1" stop-color="#d6f4ce"/></linearGradient>
<filter id="blur"><feGaussianBlur stdDeviation="15"/></filter><filter id="soft"><feGaussianBlur stdDeviation="4"/></filter>
<radialGradient id="dew" cx=".3" cy=".2"><stop stop-color="#fff" stop-opacity=".95"/><stop offset=".4" stop-color="#d6f7ef" stop-opacity=".4"/><stop offset="1" stop-color="#417e76" stop-opacity=".8"/></radialGradient>
</defs>`);
const p=(d,fill,extra='')=>add(`<path d="${d}" fill="${fill}" ${extra}/>`);
const e=(cx,cy,rx,ry,fill,extra='')=>add(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`);
const line=(d,color,w=2,extra='')=>p(d,'none',`stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}`);
p('M0 0H1600V900H0Z','url(#air)'); e(310,170,720,590,'url(#sun)');
// Far garden: deliberately low contrast and quiet on the left.
add('<g opacity=".36" filter="url(#blur)">');
p('M600 685C565 446 643 205 785 81C817 306 727 514 600 685',' #b4d3a2');
p('M1193 680C1082 336 1277 109 1558 122C1504 374 1387 573 1193 680','#a4cba2');
p('M1390 682C1428 408 1535 355 1660 332L1640 728Z','#80b89a');
p('M0 735Q260 643 504 702T1000 680T1600 682V900H0Z','#c2d9af'); add('</g>');
p('M0 797C265 750 402 756 611 730C934 677 1199 715 1600 694V900H0Z','url(#ground)');
// Tall translucent garden leaves, off the menu.
line('M1530 747C1487 551 1410 322 1324 191','#80a27b',9);
p('M1409 421C1301 391 1209 282 1190 171C1327 179 1419 265 1409 421','url(#leaf)');
line('M1398 397Q1306 276 1214 192','#c6dea3',3);
p('M1469 535C1442 365 1517 271 1598 237C1624 384 1579 495 1469 535','url(#leaf)');
line('M1484 506Q1531 360 1581 268','#d6e8b1',3);
p('M656 687C604 570 618 441 683 365C752 478 724 602 656 687','url(#leaf)','opacity=".65"');
line('M655 668Q681 522 680 390','#d7e8ad',3);
// Root platform: broad sculpted volumes, no tiled grass.
p('M546 826C659 773 681 734 790 732C896 728 943 756 1038 740C1190 710 1232 740 1330 722C1434 707 1519 741 1600 725V900H536Z','url(#wood)');
p('M612 814C747 756 807 761 906 778C1031 801 1113 746 1221 768C1367 803 1433 745 1600 757','none','stroke="#efe0ae" stroke-width="10" opacity=".4"');
line('M716 831C869 792 943 856 1079 807S1347 837 1494 786','#675f45',5,'opacity=".36"');
line('M1004 878C1185 813 1311 887 1536 824','#70664a',4,'opacity=".28"');
// Raised root lip, fissures and sparse sun flecks; confined to right of menu.
p('M573 843C683 813 690 795 742 797C810 798 825 823 906 817C1000 809 1030 830 1108 806C1220 773 1297 812 1374 795C1457 778 1531 784 1600 764V800C1490 819 1465 814 1391 830C1291 851 1228 814 1135 840C1007 878 946 843 865 854C776 870 738 829 663 852L557 883Z','url(#wood)');
line('M600 844Q695 804 745 806T891 829Q959 814 1006 829','#e0c394',4,'opacity=".6"');
p('M1102 838L1145 806L1184 800L1157 816L1147 831L1115 849L1093 869L1109 846L1068 853Z','#5c5941','opacity=".65"');
line('M1109 837L1147 801L1183 796','#e0cb9d',3,'opacity=".7"');
p('M1417 850L1431 827L1475 813L1444 834L1435 858L1401 875Z','#675941','opacity=".6"');
line('M1434 825L1475 808','#dec18e',3,'opacity=".7"');
add('<g opacity=".28" filter="url(#soft)">');
e(1181,771,31,7,'#fff6bd');e(686,794,26,6,'#fff6bd');e(1528,814,20,5,'#fff6bd');e(955,856,36,5,'#f8e9ae');add('</g>');
// Rear grass cluster gives a non-stage edge.
line('M672 776Q661 728 638 715M674 776Q688 740 709 727M673 771Q670 741 677 714','#6e915c',3);
p('M664 747Q639 743 633 724Q654 723 664 747M683 752Q688 729 706 725Q706 743 683 752','url(#leaf)');
// Grounding shadows.
add('<g filter="url(#soft)" fill="#3d4b3b" opacity=".27">');e(893,773,198,22,'#3d4b3b');e(1398,777,184,27,'#3d4b3b');add('</g>');
// Four walking legs for each insect, built as tapered articulated limbs.
function leg(a,b,c,d,col,scale=1){
 const [x,y]=a,[u,v]=b,[q,r]=c,[h,k]=d;
 add('<g'+(scale<1?' opacity=".78"':'')+'>');
 const w=12*scale;
 p(`M${x-w} ${y-5} Q${(x+u)/2-20} ${(y+v)/2-13} ${u-w} ${v-6} Q${u-14} ${v+11} ${u+3} ${v+14} Q${(u+q)/2+7} ${(v+r)/2} ${q+4} ${r-2} L${h} ${k} Q${h-15} ${k+5} ${q-7} ${r+7} Q${(u+q)/2-9} ${(v+r)/2} ${u-6} ${v+8} Q${u+13} ${v-2} ${x+w} ${y+4}Z`,'url(#joint)');
 p(`M${x-w} ${y-9} Q${(x+u)/2-15} ${(y+v)/2-19} ${u+6} ${v-13} Q${u+16} ${v-1} ${u+4} ${v+5} Q${(x+u)/2} ${(y+v)/2+4} ${x-w} ${y-9}Z`,`url(#${col})`);
 e(u,v,11*scale,8*scale,'url(#joint)');
 line(`M${u-4} ${v-4}Q${u+4} ${v-7} ${u+6} ${v}`,'#d3bb92',2,'opacity=".55"');
 line(`M${u-2} ${v+15}Q${(u+q)/2-3} ${(v+r)/2} ${q-1} ${r-2}`,'#b4b398',2*scale,'opacity=".55"');
 line(`M${q-3} ${r+3}L${h+6} ${k-2}M${q-3} ${r+3}L${h+1} ${k+3}`,'#514a38',2*scale);add('</g>');
}
leg([1353,587],[1277,646],[1248,735],[1218,751],'red',.7);
leg([1465,596],[1530,664],[1506,746],[1540,761],'red',.7);
leg([853,567],[785,615],[797,726],[767,746],'blue',.68);
leg([912,581],[985,644],[1020,734],[1054,749],'blue',.68);
// Blue ant: small oval gaster, narrow petiole and tilted thorax.
p('M735 522C771 492 824 513 843 546C860 581 835 625 794 633C751 638 708 611 708 578C707 553 717 537 735 522Z','url(#blue)');
p('M726 553C738 526 784 518 808 540C777 534 748 546 733 576Z','#a6deeb','opacity=".24" filter="url(#soft)"');
line('M722 596Q765 628 808 609','#367492',3);
p('M829 555Q853 546 870 556L879 580Q853 592 834 581Z','url(#joint)');
p('M854 553C861 522 904 491 938 487C960 488 968 513 955 542C940 574 901 601 879 591C860 582 851 570 854 553Z','url(#blue)');
p('M865 549Q891 508 938 500Q920 520 901 542Q878 570 865 563Z','#b5e1ed','opacity=".2" filter="url(#soft)"');
line('M917 582Q935 567 940 549','#98d4e3',3);
// Near walking pair (remaining two of four).
leg([864,582],[803,645],[745,764],[711,779],'blue');
leg([929,574],[1005,638],[1059,758],[1090,779],'blue');
// Neck and head: no human face, large lateral compound eye.
p('M934 508Q948 491 968 494L978 511Q953 530 940 532Z','url(#joint)');
p('M928 462C927 433 950 409 980 410C1017 412 1043 439 1067 457C1079 467 1072 482 1055 490C1024 505 991 525 962 522C941 520 928 492 928 462Z','url(#blue)');
p('M940 455Q946 419 979 422Q1008 424 1033 447Q990 428 957 467Z','#b3e2ef','opacity=".25" filter="url(#soft)"');
p('M1004 449C1018 442 1038 451 1045 466Q1049 480 1035 485C1017 484 1005 468 1004 449Z','url(#eye)');
e(1016,454,3,4,'#d6f5f3','transform="rotate(-48 1016 454)"');e(1035,473,1.5,2,'#789eab');
p('M1055 482C1071 479 1087 484 1090 495L1078 493L1071 500L1057 496Z','url(#joint)');
p('M1040 500Q1061 511 1081 502L1072 515Q1053 524 1038 511Z','url(#blueLight)');
// Bent segmented antennae, both visibly rooted on crown.
line('M975 419Q979 373 1000 344L1045 331','#345f75',8);
line('M989 379L981 377M997 352L990 348M1025 339L1023 333','#43687b',3);
line('M976 417Q981 375 1002 347L1043 333','#a2d9e7',3);
line('M1005 428Q1028 367 1059 365L1080 377','#345f75',7);
e(1045,332,7,5,'#70b4cd');e(1080,377,6,5,'#82c6db');
// Red beetle broad elytra, rounded not humanoid.
p('M1388 480C1415 445 1478 450 1517 481C1558 516 1579 581 1557 624C1537 665 1472 667 1427 644C1380 621 1352 531 1388 480Z','url(#red)');
p('M1411 483C1451 466 1490 480 1513 512C1468 486 1444 506 1416 537Z','#f8ba87','opacity=".25" filter="url(#soft)"');
line('M1450 475C1435 527 1460 609 1500 651','#843c33',5);
line('M1457 483C1447 535 1469 605 1506 639','#f1a775',3,'opacity=".7"');
p('M1343 504C1378 488 1421 516 1433 552C1448 598 1414 630 1382 623C1340 615 1313 571 1323 540C1326 525 1333 511 1343 504Z','url(#red)');
p('M1334 534Q1348 508 1380 524Q1405 534 1412 555Q1373 537 1345 558Z','#ffd1a4','opacity=".2" filter="url(#soft)"');
leg([1376,610],[1242,690],[1290,761],[1251,783],'red');
leg([1471,622],[1545,695],[1468,768],[1507,786],'red');
p('M1328 520Q1310 507 1314 489L1342 480L1360 520Z','url(#joint)');
// Beetle head, short blunt mandibles and forehead horn, facing left.
p('M1238 447C1248 426 1270 406 1299 411L1330 423C1345 439 1353 475 1357 504C1341 523 1310 516 1286 504L1247 480Q1228 465 1238 447Z','url(#red)');
p('M1248 444Q1270 414 1298 422L1326 435Q1283 426 1251 456Z','#ffd3a0','opacity=".3" filter="url(#soft)"');
p('M1291 438C1277 436 1260 447 1256 461Q1251 475 1266 476C1283 473 1291 457 1291 438Z','url(#eye)');e(1277,444,3,4,'#ffe8ca','transform="rotate(43 1277 444)"');e(1266,466,1.5,2,'#8eaaa7');
p('M1243 449Q1221 435 1219 414Q1231 411 1241 427L1256 434Z','url(#redLight)');
p('M1248 473C1228 474 1220 485 1219 502Q1232 493 1243 500L1263 489Z','url(#joint)');
p('M1266 493Q1254 519 1229 517L1240 529Q1268 530 1283 504Z','url(#redLight)');
line('M1281 407Q1288 380 1266 359L1239 353','#7c4a3e',8);line('M1281 405Q1287 382 1265 361L1240 355','#edb586',3);
line('M1311 410Q1338 387 1330 364L1310 349','#7c4a3e',8);
line('M1333 391L1326 387M1332 370L1325 372M1278 376L1286 373M1255 356L1254 363','#93634f',3);e(1238,354,7,5,'#d78c65');e(1310,349,7,5,'#d78c65');
// Natural overlapping rims, micro-scratches and restrained edge reflections.
p('M1387 558C1397 609 1437 649 1496 653Q1530 657 1555 625C1550 657 1512 677 1468 662C1420 651 1396 615 1387 558Z','#622f2e','opacity=".4"');
line('M1399 490C1434 456 1486 467 1516 496','#ffd6a0',3,'opacity=".65"');
line('M1549 552Q1574 609 1540 640','#eea479',3,'opacity=".6"');
line('M1440 481Q1429 513 1438 545','#783c34',3,'opacity=".55"');
line('M1337 550Q1337 583 1369 605Q1396 624 1414 610','#743b32',4,'opacity=".45"');
line('M1340 539Q1351 519 1373 526','#ffce9b',3,'opacity=".55"');
line('M1343 477L1348 495','#f2ae7c',2,'opacity=".5"');
line('M1242 448Q1257 430 1271 428','#ffd8a8',2,'opacity=".6"');
line('M937 471Q938 486 945 495','#80b9d2',2,'opacity=".55"');
line('M940 445Q940 430 956 423','#c8edf2',3,'opacity=".65"');
line('M865 558Q873 587 900 587Q927 581 944 555','#183f5c',4,'opacity=".4"');
line('M718 575Q716 613 767 626Q807 634 832 606','#143e5b',4,'opacity=".35"');
line('M721 553Q734 521 766 521','#b8e7f1',3,'opacity=".65"');
line('M741 606Q767 617 793 613M748 610Q764 619 778 616','#9acbdd',2,'opacity=".5"');
line('M1472 504L1486 516M1475 501L1482 507M1510 589L1524 607M1513 590L1518 596','#f8bd88',2,'opacity=".5"');
line('M963 456L968 461M962 460L964 463','#aad7e6',1.5,'opacity=".4"');
// Eye sockets follow the direction of the elongated side eyes; no human brows.
line('M1000 449Q1014 439 1034 449','#235470',3,'opacity=".7"');
line('M1268 440Q1282 433 1293 438','#9a4937',2,'opacity=".6"');
// Weapons: diagonal leaf sword meets only the left edge of axe blade at 1175,440.
// Axe haft stays entirely to right of contact and clear of beetle face.
line('M1260 676L1202 398','#443c31',18);line('M1257 673L1199 400','#b59b68',9);line('M1254 662L1200 406','#e3ce94',2);
p('M1200 405C1190 395 1187 377 1191 359C1167 376 1160 410 1175 440C1183 465 1197 480 1216 485L1211 461L1222 452L1212 416Z','url(#blade)');
p('M1191 359C1167 376 1160 410 1175 440C1183 465 1197 480 1216 485L1211 473C1195 465 1185 448 1181 433C1172 403 1178 379 1191 359Z','#f0f8d9');
line('M1200 412L1210 451','#668d76',3);
// Blue sword forelimb from thorax, elbow to unmistakable hooked tarsal grip.
p('M932 537Q971 548 996 527L1041 493L1056 509Q1028 550 996 563Q963 578 938 561Z','url(#joint)');
p('M940 533Q960 540 982 530L993 545Q974 564 945 557Z','url(#blue)');
p('M989 531Q1018 510 1039 489L1050 503Q1028 535 1004 548Z','url(#blueLight)');
// Sword axis 1048,507 to 1175,440: no crossing shaft.
p('M1044 496C1084 468 1138 444 1175 440C1157 467 1109 496 1056 512Z','url(#blade)');
p('M1055 505L1175 440Q1133 475 1060 513Z','#729d85');line('M1060 500L1167 444','#f8ffe9',2);
line('M1031 514L1054 502','#5c6850',11);line('M1033 512L1054 501','#c6ba85',4);
line('M1038 490Q1046 502 1062 514','#799a74',6);
p('M1031 507Q1039 490 1051 493Q1063 497 1058 508L1053 508Q1055 500 1048 500Q1042 500 1038 511Z','url(#joint)');
line('M1038 515Q1052 521 1057 510M1034 511Q1047 517 1051 506','#6c6352',5);
line('M1040 496Q1048 493 1053 499','#cec4a1',2);
// Blue second foreleg and small low leaf buckler.
p('M926 564Q974 575 1006 604L997 626Q959 609 922 587Z','url(#joint)');
p('M930 565Q959 571 982 590L968 605L929 584Z','url(#blue)');
p('M1009 567C1043 594 1056 642 1032 682C991 680 961 646 964 609Q974 585 1009 567Z','url(#leaf)');
line('M1008 580Q997 623 1031 670','#d9ecb0',4);line('M1003 607L980 606M1005 626L1033 612M1014 647L988 639','#bbd997',2);
// Red two forelimbs clasp the same connected haft at distinct heights.
p('M1344 550Q1300 564 1256 546L1227 516L1215 530Q1225 565 1250 578Q1306 599 1356 576Z','url(#joint)');
p('M1342 546Q1311 552 1288 547L1282 573Q1316 585 1349 571Z','url(#red)');
p('M1282 547L1249 533L1235 550L1275 573Z','url(#redLight)');
p('M1236 525Q1224 510 1214 516Q1205 522 1213 535L1218 535Q1213 523 1219 523Q1224 521 1230 531Z','url(#joint)');
line('M1233 533Q1222 548 1215 535M1238 537Q1229 551 1221 542','#76634e',5);
line('M1214 519Q1220 514 1226 521','#ccb38b',2);
p('M1367 592Q1333 633 1298 637L1253 616L1244 634Q1270 657 1301 662Q1358 653 1389 611Z','url(#joint)');
p('M1361 586Q1344 609 1320 618L1326 644Q1364 634 1384 607Z','url(#red)');
p('M1263 622Q1250 607 1240 612Q1231 618 1239 631L1244 630Q1239 620 1245 619Q1251 618 1257 627Z','url(#joint)');
line('M1262 631Q1250 645 1243 634M1266 636Q1257 649 1249 641','#76634e',5);
line('M1240 615Q1247 610 1254 618','#ccb38b',2);
// Tiny leaf chips, not an explosion.
p('M1167 421L1159 409L1171 414Z','#e9c875');p('M1180 465L1188 476L1177 472Z','#9db777');line('M1156 440L1148 438','#fff9cf',3);e(1187,423,3,3,'#fff8d2');
// Sparse daisies and dew establish miniature scale.
function daisy(x,y,k){line(`M${x} ${y+48*k}Q${x-5*k} ${y+20*k} ${x} ${y}`,'#78945c',3*k);for(let i=0;i<8;i++){let a=i*Math.PI/4; e(x+Math.cos(a)*10*k,y+Math.sin(a)*10*k,8*k,4*k,'#fffbee',`transform="rotate(${i*45} ${x+Math.cos(a)*10*k} ${y+Math.sin(a)*10*k})"`);}e(x,y,6*k,5*k,'#e4bd5e');}
daisy(649,735,.85);daisy(1558,679,.8);daisy(586,787,.55);
e(681,474,8,12,'url(#dew)');e(678,469,2,3,'#fff');e(1430,334,9,13,'url(#dew)');e(1427,329,3,3,'#fff');
// A few rooted foreground blades and clover, no lawn tiling.
line('M1197 883Q1189 841 1175 827M1199 880Q1208 846 1223 837M1200 882Q1201 847 1194 830','#557a4d',3);
p('M1187 855C1153 863 1153 839 1168 838Q1182 839 1187 855M1208 858C1214 834 1239 837 1233 850Q1225 861 1208 858','url(#leaf)');
e(1172,844,3,4,'url(#dew)');
// Foreground framing confined to bottom corners.
p('M0 900V821C83 817 144 839 200 900Z','url(#darkLeaf)');
p('M99 900C83 855 53 824 26 806C109 794 174 832 193 900Z','url(#leaf)');
p('M1600 900H1387C1420 847 1485 829 1539 842C1528 868 1492 887 1458 895C1515 879 1557 814 1600 792Z','url(#darkLeaf)');
line('M1425 891Q1488 854 1523 852','#87a676',2);line('M1598 828L1549 897','#74966a',3);
add('</svg>'); fs.writeFileSync(path.join(__dirname,'..','public','art','cover.svg'),s.join('\n'));
