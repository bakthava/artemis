import { testGeneratorNumberPositive, testGeneratorNumberInvalid } from './test-modules/generator-number.mjs';

export default async function run(page, fixtures){
  const results = [];
  results.push(await testGeneratorNumberPositive(page, fixtures));
  results.push(await testGeneratorNumberInvalid(page, fixtures));
  return results;
}
