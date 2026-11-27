import test from 'node:test';
import assert from 'node:assert/strict';
import { checkHardwareCompatibility } from './hardwareCompatibility';

test('detects compatible CPU, Mainboard, RAM, GPU, PSU, and Case configuration', () => {
  const report = checkHardwareCompatibility([
    { name: 'Intel Core i5-14600K', category: 'cpu', normalizedSpecs: { socket: 'LGA1700' } },
    { name: 'ASUS TUF GAMING B760M-PLUS WIFI', category: 'motherboard', normalizedSpecs: { socket: 'LGA1700', memoryType: 'DDR5', formFactor: 'MICRO-ATX' } },
    { name: 'Corsair Vengeance 32GB DDR5', category: 'ram', normalizedSpecs: { memoryType: 'DDR5' } },
    { name: 'RTX 4070 Super', category: 'gpu', specs: { recommendedPsuWatts: 650, lengthMm: 300 } },
    { name: 'Seasonic Focus GX-750 750W', category: 'power_supply', normalizedSpecs: { powerWatts: 750 } },
    { name: 'NZXT H5 Flow', category: 'pc_case', normalizedSpecs: { formFactor: 'ATX' }, specs: { maxGpuLengthMm: 365 } },
  ]);

  assert.equal(report.overallStatus, 'COMPATIBLE');
  assert.equal(report.checks.length, 5);
  assert.ok(report.checks.every((c) => c.status === 'COMPATIBLE'));
});

test('flags incompatible socket, DDR type, PSU wattage, and GPU length deterministically', () => {
  const report = checkHardwareCompatibility([
    { name: 'AMD Ryzen 7 7800X3D', category: 'cpu', normalizedSpecs: { socket: 'AM5' } },
    { name: 'MSI PRO B760M-A', category: 'motherboard', normalizedSpecs: { socket: 'LGA1700', memoryType: 'DDR4', formFactor: 'ATX' } },
    { name: 'G.Skill Trident Z5 DDR5', category: 'ram', normalizedSpecs: { memoryType: 'DDR5' } },
    { name: 'RTX 4090', category: 'gpu', specs: { recommendedPsuWatts: 850, lengthMm: 350 } },
    { name: 'Corsair CV550 550W', category: 'power_supply', normalizedSpecs: { powerWatts: 550 } },
    { name: 'Mini ITX Case', category: 'pc_case', normalizedSpecs: { formFactor: 'MINI-ITX' }, specs: { maxGpuLengthMm: 310 } },
  ]);

  assert.equal(report.overallStatus, 'INCOMPATIBLE');
  assert.equal(report.checks.filter((c) => c.status === 'INCOMPATIBLE').length, 5);
});

test('returns UNKNOWN when required technical specifications are missing', () => {
  const report = checkHardwareCompatibility([
    { name: 'Unknown CPU', category: 'cpu' },
    { name: 'Unknown Mainboard', category: 'motherboard' },
  ]);

  assert.equal(report.overallStatus, 'UNKNOWN');
  assert.equal(report.checks.length, 1);
  assert.equal(report.checks[0].status, 'UNKNOWN');
});
