// A stand-in for gh. FAKE_GH_FIXTURE names a JSON file:
// { view: {...}, graphql: {...} | graphqlError: "text", rest: [...] }.
// Each call is appended to FAKE_GH_LOG when set, so tests can see what ran.
const fs = require('fs');

const args = process.argv.slice(2);
const fixture = JSON.parse(fs.readFileSync(process.env.FAKE_GH_FIXTURE, 'utf8'));
if (process.env.FAKE_GH_LOG) fs.appendFileSync(process.env.FAKE_GH_LOG, `${args.slice(0, 2).join(' ')}\n`);
const reply = (data) => process.stdout.write(JSON.stringify(data));

if (args[0] === 'pr' && args[1] === 'view') {
  reply(fixture.view);
} else if (args[0] === 'api' && args[1] === 'graphql') {
  if (fixture.graphqlError) {
    process.stderr.write(`${fixture.graphqlError}\n`);
    process.exit(1);
  }
  reply(fixture.graphql || { data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } });
} else if (args[0] === 'api' && /\/comments/.test(args[1] || '')) {
  reply(fixture.rest || []);
} else {
  process.stderr.write(`fake gh: no answer for ${args.join(' ')}\n`);
  process.exit(1);
}
