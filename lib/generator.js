(function() {
    'use strict';

    var _ = require('lodash'),
        FS = require('fs'),
        Path = require('path'),
        Entry = require('./entry.js');


    /**
     * The HTML for the close tag.
     *
     * @static
     * @memberOf MarkdownGenerator
     * @type string
     */
    var closeTag = "\n<!-- /div -->\n";

    /**
     * An array of JSDoc entries.
     *
     * @memberOf MarkdownGenerator
     * @type Array
     */
    var entries = [];

    /**
     * The HTML for the open tag.
     *
     * @memberOf MarkdownGenerator
     * @type string
     */
    var openTag = "\n<!-- div -->\n";

    /**
     * An options array used to configure the generator.
     *
     * @memberOf MarkdownGenerator
     * @type Array
     */
    var options = [];

    /**
     * The file's source code.
     *
     * @memberOf MarkdownGenerator
     * @type string
     */
    var source = '';

    /**
     * The array of code snippets that are tokenized by `escape`.
     *
     * @private
     * @memberOf MarkdownGenerator
     * @type Array
     */
    var snippets = [];


    function ucfirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }


    /**
     * Extracts the documentation entries from source code.
     *
     * @static
     * @memberOf Entry
     * @param {string} source The source code.
     * @returns {Array} The array of entries.
     */
    function getEntries(source) {
        return source.match(/\/\*\*(?![-!])[\s\S]*?\*\/\s*.+/g) || [];
    }

    /**
     * The MarkdownGenerator constructor.
     *
     * @constructor
     * @param {string} source The source code to parse.
     * @param {Array} options The options array.
     */
    function MarkdownGenerator(source, options) {
        if (!_.isObject(options)) {
            options = {};
        }

        // juggle arguments
        if (_.isObject(source)) {
            options = source;
        } else {
            options['source'] = source;
        }

        try {
            var source = options.hasOwnProperty('source') && options['source'];
            source = Path.resolve(source);
            options.path = FS.realpathSync(options['source']);
        } catch (err) {
            // source is no real path
        }

        if (options.path) {
            options.source = FS.readFileSync(options.path, 'UTF-8');

            var ext = Path.extname(options.path).substring(1);
            if (!options.lang && ext) {
                options.lang = ext;
            }

            if (!options.title) {
                options.title = Path.basename(options.path) + ' API documentation';
            }
        }

        if (!options.lang) {
            options.lang = 'js'
        }

        if (!options.toc) {
            options.toc = 'properties';
        }

        this.options = options;
        this.source = options.source.replace(/[\r\n]*/, "\n");
        this.entries = Entry.getEntries(this.source);

        _.forEach(this.entries, function(value, index) {
            this.entries[index] = new Entry(value, this.source, options.lang);
        }, this);


        // private functions
        /**
         * Performs common string formatting operations.
         *
         * @private
         * @static
         * @memberOf MarkdownGenerator
         * @param {string} $string The string to format.
         * @returns {string} The formatted string.
         */
        function format($string) {
            var tokenized = $string.match(/`[^`]+`/g);

            // tokenize inline code snippets
            _.forEach(tokenized, function(snippet, index) {
                $string = $string.replace(snippet, '__token' + index + '__');
            });

            // italicize parentheses
            $string = $string.replace(/(^|\s)(\([^)]+\))/, '$1*$2*');

            // mark numbers as inline code
            $string = $string.replace(/[\t ](-?\d+(?:.\d+)?)(?!\.[^\n])/, ' `$1`');

            // detokenize inline code snippets
            _.forEach(tokenized, function(snippet, index) {
                $string = str_replace('__token' + index + '__', $snippet);
            });

            return trim($string);
        }


        /**
         * Modify a string by replacing named tokens with matching assoc. array values.
         *
         * @private
         * @static
         * @memberOf MarkdownGenerator
         * @param {string} $string The string to modify.
         * @param {Array|Object} $object The template object.
         * @returns {string} The modified string.
         */
        function interpolate($string, $object) {
            var $tokens = $string.match(/#\{([^}]+)\}/g);

            _.forEach($tokens, function($token) {
                var replace = $token.replace(/([.*+?^${}()|[\]\\])/, '\\$1');
                var $pattern = new RegExp('/#{' + replace + '}/');
                var $replacement = '';

                if (_.isObject($object)) {
                    var matches = $token.match('/\(([^)]+?)\)$/'),
                        arg = matches.pop(),
                        $args = split(/,\s*/, arg),
                        $method = 'get' + ucfirst($token.replace(/\([^)]+?\)$/, ''));

                    if (_.isFunction($object[$method])) {
                        $replacement = $object[$method].apply(this, $args);
                    } else if ($object[$token]) {
                        $replacement = $object[$token];
                    }
                } else if ($object[$token]) {
                    $replacement = $object[$token];
                }
                $string = $string.replace($pattern, trim($replacement));
            });
            return format($string);
        }

        /**
         * Adds the given `$entries` to the `$result` array.
         *
         * @private
         * @memberOf MarkdownGenerator
         * @param {Array} $result The result array to modify.
         * @param {Array} $entries The entries to add to the `$result`.
         */
        function addEntries($result, $entries) {
            _.forEach($entries, function(entry) {
                // skip aliases
                if ($entry.isAlias()) {
                    return;
                }

                $result.push(
                    this.openTag,
                    interpolate("### <a id=\"#{hash}\"></a>`#{member}#{separator}#{call}`\n<a href=\"##{hash}\">#</a> [&#x24C8;](#{href} \"View in source\") [&#x24C9;][1]\n\n#{desc}", {
                        'call': $entry.getCall(),
                        'desc': escapeMarkdown($entry.getDesc()),
                        'hash': $entry.hash,
                        'href': $entry.href,
                        'member': $entry.member,
                        'separator': $entry.separator
                    })
                );

                // @alias
                var aliases = $entry.getAliases();
                if (aliases.length) {
                    $result.push('', '#### Aliases');

                    aliases = _.map(aliases, function(alias) {
                        return interpolate('#{member}#{separator}#{name}', alias);
                    });

                    $result.push('*' + aliases.join(', ') + '*');
                }

                // @param
                var params = $entry.getParams();
                if (params.length) {
                    $result.push('', '#### Arguments');

                    _.forEach(params, function(param, index) {
                        $result.push(interpolate('#{num}. `#{name}` (#{type}): #{desc}', {
                            'desc': escapeMarkdown(param[2]),
                            'name': param[1],
                            'num': index + 1,
                            'type': escapeMarkdown(param[0])
                        }));
                    });
                }


                // @returns
                var returns = $entry.getReturns();
                if (returns.length) {
                    $result.push('', '#### Returns');
                    $result.push(interpolate('(#{type}): #{desc}', {
                        'desc': escapeMarkdown(returns[1]),
                        'type': escapeMarkdown(returns[0])
                    }));
                }

                // @example
                var example = $entry.getExample();
                if (example) {
                    $result.push('', '#### Example', example);
                }

                $result.push("\n* * *", closeTag);
            });
        }


        /**
         * Escapes special Markdown characters.
         *
         * @private
         * @memberOf Entry
         * @param {string} $string The string to escape.
         * @returns {string} Returns the escaped string.
         */
        function escapeMarkdown(str) {
            str = str.replace(/`.*?\`/, swapSnippetsToTokens);
            str = str.replace(/(?<!\\)\*/, '&#42;');
            str = str.replace(/(?<!\\)\[/, '&#91;');
            str = str.replace(/(?<!\\)\]/, '&#93;');
            str = str.replace(/@@token@@/, swapTokensToSnippets);
            return str;
        }

        /**
         * Swaps code snippets with tokens as a `preg_replace_callback` callback
         * used by `escape`.
         *
         * @private
         * @memberOf Entry
         * @param {Array} $matches The array of regexp matches.
         * @returns {string} Returns the token.
         */
        function swapSnippetsToTokens(match) {
            snippets.push(match);
            return '@@token@@';
        }

        /**
         * Swaps tokens with code snippets as a `preg_replace_callback` callback
         * used by `escape`.
         *
         * @private
         * @memberOf Entry
         * @returns {string} Returns the code snippet.
         */
        function swapTokensToSnippets() {
            return snippets.shift();
        }


        /**
         * Resolves the entry's hash used to navigate the documentation.
         *
         * @private
         * @memberOf MarkdownGenerator
         * @param {number|Object} entry The entry object.
         * @param {string} member The name of the member.
         * @returns {string} The url hash.
         */

        function getHash(entry, member) {
            entry = _.isNumber(entry) ? this.entries[entry] : entry;
            member = !member ? entry.getMembers(0) : member;

            var $result = (member ? member + (entry.isPlugin() ? 'prototype' : '') : '') + entry.getCall();
            $result = $result.replace(/\(\[|\[\]/, '');
            $result = $result.replace(/[\t =|\'"{}.()\]]/, '');
            $result = $result.replace(/[\[#,]+/, '-');
            return strtolower($result);
        }

        /**
         * Resolves the entry's url for the specific line number.
         *
         * @private
         * @memberOf MarkdownGenerator
         * @param {number|Object} entry The entry object.
         * @returns {string} The url.
         */

        function getLineUrl(entry) {
            entry = _.isNumber(entry) ? this.entries(entry) : entry;
            return this.options['url'] + '#L' + entry.getLineNumber();
        }

        /**
         * Extracts the character used to separate the entry's name from its member.
         *
         * @private
         * @memberOf MarkdownGenerator
         * @param {number|Object} entry The entry object.
         * @returns {string} The separator.
         */

        function getSeparator(entry) {
            entry = _.isNumber(entry) ? this.entries(entry) : entry;
            return entry.isPlugin() ? '.prototype.' : '.';
        }


        _.extend(MarkdownGenerator.prototype, {
            'generate': generate
        });


    }


    /*--------------------------------------------------------------------------*/


    /**
     * Generates Markdown from JSDoc entries.
     *
     * @memberOf MarkdownGenerator
     * @returns {string} The rendered Markdown.
     */
    function generate() {
        var $api = [],
            $byCategory = this.options['toc'] === 'categories',
            $categories = [],
            $closeTag = this.closeTag,
            $compiling = false,
            $openTag = this.openTag,
            $result = ['# ' + this.options['title']],
            $toc = 'toc';

        _.forEach(this.entries, function(entry) {
            // skip invalid or private entries
            var $name = entry.getName();
            if (!$name || entry.isPrivate()) {
                return;
            }


            var members = entry.getMembers();
            members = members && members.length ? members : [''];


            _.forEach(members, function(member) {
                // create api category arrays
                if (member && !$api[member]) {
                    // create temporary entry to be replaced later
                    $api[member] = {
                        static: [],
                        plugin: []
                    }
                }

                // append entry to api member
                if (!member || entry.isCtor() || (entry.getType() == 'Object' && !/[=:]\s*(?:null|undefined)\s*[,;]?$/.test(entry.entry))) {

                    // assign the real entry, replacing the temporary entry if it exist
                    member = (member ? member + (entry.isPlugin() ? '#' : '.') : '') + $name;
                    entry.static = $api[member] ? $api[member].static : [];
                    entry.plugin = $api[member] ? $api[member].plugin : [];

                    $api[member] = entry;
                    _.forEach(entry.getAliases(), function(alias) {
                        $api[member].static.push(alias);
                    });
                } else if (entry.isStatic()) {
                    $api[member].static.push(entry);
                    _.forEach(entry.getAliases(), function(alias) {
                        $api[member].static.push(alias);
                    });
                }
                else if (!entry.isCtor()) {
                    $api[member].plugin.push(entry);
                    _.forEach(entry.getAliases(), function(alias) {
                        $api[member].plugin.push(alias);
                    });
                }
            });
        });

        _.forEach($api, function(entry) {
            entry.hash = this.getHash($entry);
            entry.href = this.getLineUrl($entry);
            entry.separator = '';

            var member = entry.getMembers(0);
            member = ($member ? $member + this.getSeparator(entry) : '').entry.getName();
            entry.member = member.replace(new RegExp(entry.getName() + '$'), '');

            _.forEach(['static', 'plugin'], function(kind) {
                _.forEach(entry[kind], function(subentry) {
                    subentry.hash = this.getHash(subentry);
                    subentry.href = this.getLineUrl(subentry);
                    subentry.member = member;
                    subentry.separator = this.getSeparator(subentry);
                });
            });

        });


//        // custom sort for root level entries
//        // TODO: see how well it handles deeper namespace traversal
//        function sortCompare($a, $b) {
//            $score = array( 'a' => 0, 'b' => 0);
//            foreach (array( 'a' => $a, 'b' => $b) as $key => $value) {
//                // capitalized properties are last
//                if (preg_match('/[#.][A-Z]/', $value)) {
//                    $score[$key] = 0;
//                }
//                // lowercase prototype properties are next to last
//                else if (preg_match('/#[a-z]/', $value)) {
//                    $score[$key] = 1;
//                }
//                // lowercase static properties next to first
//                else if (preg_match('/\.[a-z]/', $value)) {
//                    $score[$key] = 2;
//                }
//                // root properties are first
//                else if (preg_match('/^[^#.]+$/', $value)) {
//                    $score[$key] = 3;
//                }
//            }
//            $score = $score['b'] - $score['a'];
//            return $score ? $score : strcasecmp($a, $b);
//        }
//
//        uksort($api, 'sortCompare');

        // sort static and plugin sub-entries
        _.forEach($api, function(entry) {
            _.forEach(['static', 'plugin'], function(kind) {
                var sortBy = {a: [], b: [], c: []};
                _.forEach(entry[kind], function(subentry) {
                    var name = subentry.getName();
                    // functions w/o ALL-CAPs names are last
                    sortBy.a.push(subentry.getType() === 'Function' && !/^[A-Z_]+$/.test(name));
                    // ALL-CAPs properties first
                    sortBy.b.push(/^[A-Z_]+$/.test(name));
                    // lowercase alphanumeric sort
                    sortBy.c.push(name.toLowerCase());
                });

                // TODO
                //array_multisort($sortBy['a'], SORT_ASC,  $sortBy['b'], SORT_DESC, $sortBy['c'], SORT_ASC, $entry->{$kind});
            });

        });

        // add categories
        _.forEach($api, function(entry) {
            $categories[entry.getCategory()].push(entry);
            _.forEach(['static', 'plugin'], function(kind) {
                _.forEach(entry[kind], function(subentry) {
                    $categories[subentry.getCategory()].push(subentry);
                });
            });
        });

        // TODO sort categories
        //ksort($categories);

        // ???? WTF
        _.forEach(['Methods', 'Properties'], function(category) {
            if ($categories[category]) {
                var entries = $categories[category];
                $categories[category] = null;
                $categories[category] = entries;
            }
        });


        // compile TOC
        $result.push($openTag);

        // compile TOC by categories
        if ($byCategory) {
            _.forEach($categories, function($entries, $category) {
                if ($compiling) {
                    $result = $result.push($closeTag);
                } else {
                    $compiling = true;
                }

                // assign TOC hash
                if ($result.length === 2) {
                    $toc = $category.toLowerCase();
                }

                $result.push($openTag);

                var tmp = '## ';
                if ($result.length === 2) {
                    tmp += '<a id="' + $toc + '"></a>';
                }
                tmp += '`' + $category + '`';
                $result.push(tmp);


                _.forEach($entries, function($entry) {
                    if ($entry.isAlias()) {
                        $result.push(interpolate('* <a href="##{hash}" class="alias">`#{member}#{separator}#{name}` -> `#{realName}`</a>', {
                            hash: $entry.hash,
                            member: $entry.member,
                            name: $entry.getName(),
                            realName: $entry.owner.getName(),
                            separator: $entry.separator
                        }));
                    } else {
                        $result.push(interpolate('* <a href="##{hash}">`#{member}#{separator}#{name}`</a>', $entry));
                    }
                });
            });

            // compile TOC by namespace
        } else {
            // add categories
            _.forEach($api, function(entry) {
                if ($compiling) {
                    $result = $result.push($closeTag);
                } else {
                    $compiling = true;
                }

                var member = entry.member + entry.getName();

                // assign TOC hash
                if ($result.length === 2) {
                    $toc = member;
                }

                $result.push($result, $openTag);

                var tmp = '## ';
                if ($result.length === 2) {
                    tmp += '<a id="' + $toc + '"></a>';
                }
                tmp += '`' + member + '`';
                $result.push(tmp);

                $result.push(interpolate('* [`' + member + '`](##{hash})', entry));

                // add static and plugin sub-entries
                _.forEach(['static', 'plugin'], function(kind) {
                    if (kind == 'plugin' && entry.plugin.length) {
                        $result.push($closeTag, $openTag, '## `' + $member + ($entry.isCtor()) ? '.prototype`' : '`');
                    }

                    _.forEach(entry[kind], function(subentry) {
                        subentry.member = member;
                        if (subentry.isAlias()) {
                            result.push(interpolate('* <a href="##{hash}" class="alias">`#{member}#{separator}#{name}` -> `#{realName}`</a>', {
                                hash: subentry.hash,
                                member: subentry.member,
                                name: subentry.getName(),
                                realName: subentry.owner.getName(),
                                separator: subentry.separator
                            }));
                        }
                    });
                });
            });

        }

        $result.push($closeTag,$closeTag);

        /*------------------------------------------------------------------------*/

        // compile content
        $compiling = false;
        $result.push($openTag);

        if ($byCategory) {
            _.forEach($categories, function($entries, $category) {
                if ($compiling) {
                    $result.push($closeTag);
                } else {
                    $compiling = true;
                }
                if ($category !== 'Methods' && $category !== 'Properties') {
                    $category = '“' + $category + '” Methods';
                }

                $result.push($openTag,'## `' + $category + '`');
                this.addEntries($result,$entries);
            });
        } else {
            // add categories
            _.forEach($api, function(entry) {
                // skip aliases
                if (entry.isAlias()) {
                    return;
                }
                if ($compiling) {
                    $result.push($closeTag);
                } else {
                    $compiling = true;
                }
                // add root entry name
                var member = entry.member + entry.getName();

                $result.push($openTag, '## `' + $member + '`');

                // add static and plugin sub-entries
                _.forEach(['static', 'plugin'], function(kind) {

                    var subentries = _.isString(kind) ? entry[kind] : [kind];

                    // add sub-entry name
                    if (kind != 'static' && entry.getType() != 'Object' && subentries.length && subentries[0] !== kind) {
                        if (kind === 'plugin') {
                            $result.push($closeTag);
                        }
                        $result.push($openTag,'## `' + member + (kind === 'plugin' ? '.prototype`' : '`'));
                    }

                    this.addEntries($result, subentries);
                });
            });
        }

        // close tags add TOC link reference
        $result.push($closeTag, $closeTag, '', '  [1]: #' + $toc + ' "Jump back to the TOC."');

        // cleanup whitespace
        var resultString = $result.join("\n");
        return resultString.replace(/[\t ]+\n/,"\n").trim();

    }


    module.exports.generate = function(options) {
        var md = new MarkdownGenerator(options);
        return md.generate();
    };

}());
