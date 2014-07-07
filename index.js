var MarkdownGenerator = require('./lib/generator.js');
var test = MarkdownGenerator.generate({
    source: 'lodash.js'
});


console.log('TEST',test);