#!/usr/bin/env node
// Prints the prompt for one eval case.
//   node evals/prompt.js <case>           candidate prompt: Situation, then Task
//   node evals/prompt.js <case> --judge   judge prompt: the case, the rubric and the scoring rules
const fs = require('fs');
const path = require('path');

const [name, flag] = process.argv.slice(2);
const file = path.join(__dirname, 'cases', `${name || ''}.md`);
if (!name || !fs.existsSync(file)) {
  const cases = fs.readdirSync(path.join(__dirname, 'cases')).map((f) => path.basename(f, '.md'));
  console.error(`usage: node evals/prompt.js <case> [--judge]\ncases: ${cases.join(', ')}`);
  process.exit(1);
}

const text = fs.readFileSync(file, 'utf8');
const section = (title) => {
  const match = new RegExp(`^## ${title}\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(text);
  if (!match) throw new Error(`${file}: no "## ${title}" section`);
  return match[1].trim();
};

const situation = section('Situation');
const task = section('Task');
const rubric = section('Rubric');
const criteria = rubric.split(/\r?\n/).filter((line) => /^\d+\./.test(line)).length;

if (flag !== '--judge') {
  process.stdout.write(`${situation}\n\n${task}\n`);
} else {
  process.stdout.write(`You grade answers to one task. Each answer is labelled (A1, B1, ...). You don't know which model or version wrote which.

The task the answers were given:

${situation}

${task}

Rubric:

${rubric}

For each answer, score every criterion 0, 0.5 or 1 and add them up (out of ${criteria}). Quote the line that earns or loses each point.
Then list the differences between the answers that a user would notice, one line each, and estimate each answer's length in characters.
End with a verdict per pair: equivalent, minor_gaps or major_gaps.

The answers follow.
`);
}
