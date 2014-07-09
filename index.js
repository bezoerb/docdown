var fs = require('fs');
var MarkdownGenerator = require('./lib/generator.js');
var test = MarkdownGenerator.generate({
    source: 'lodash.js'
});


fs.writeFileSync('test.md', test);

console.log('TEST',test);