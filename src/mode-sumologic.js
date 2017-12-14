// jshint ignore: start
// jscs: disable
ace.define("ace/mode/sumologic_highlight_rules",["require","exports","module","ace/lib/oop","ace/mode/text_highlight_rules"], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

var SumologicHighlightRules = function() {
  var keywords = (
    'as|by|from|in|matches|nodrop|on|regex|with' +
    '_collector|_index|_source|_sourceCategory|_sourceHost|_sourceName|_view'
  );

  var builtinConstants = (
    'true|false'
  );

  var builtinFunctions = (
    'abs|accum|acos|asin|atan|atan2|avg|backshift|cbrt|ceil|concat|cos|cosh|count|count_distinct|count_frequent|diff|exp|expm1|fields|fillmissing|filter|first|last|floor|format|formatDate|lookup|hypot|if|ipv4ToNumber|isNull|isEmpty|isBlank|join|length|limit|log|log10|log1p|luhn|num|number|toLong|pct|merge|max|min|most_recent|least_recent|now|outlier|csv|split|json|keyvalue|kv|xml|parseDate|parseHex|pct_sampling|predict|queryEndTime|queryStartTime|queryTimeRange|replace|rollingstd|round|save|sessionize|sin|sinh|smooth|sort|sqrt|stddev|substring|sum|tan|tanh|timeslice|toDegrees|toLowerCase|toUpperCase|top|toRadians|total|trace|transaction|transpose|urldecode|where|getCIDRPrefix|compareCIDRPrefix|maskFromCIDR'
  );

  var keywordMapper = this.createKeywordMapper({
    "support.function": builtinFunctions,
    "keyword": keywords,
    "constant.language": builtinConstants
  }, "identifier", true);

  this.$rules = {
    "start" : [ {
      token : "string", // single line
      regex : /"(?:[^"\\]|\\.)*?"/
    }, {
      token : "string", // string
      regex : "'.*?'"
    }, {
      token : "constant.numeric", // float
      regex : "[-]?\\d+(?:(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)?\\b"
    }, {
      token : "constant.language", // time
      regex : "\\d+[smh]"
    }, {
      token : "constant.language", // unit
      regex : "\\d+[kKMGBTP]"
    }, {
      token : keywordMapper,
      regex : "[a-zA-Z]+"
    }, {
      token : "keyword.operator",
      regex : "\\+|\\-|\\*|\\/|%|=|==|!=|<=|>=|<>|<|>"
    }, {
      token : "paren.lparen",
      regex : "[[({]"
    }, {
      token : "paren.rparen",
      regex : "[\\])}]"
    }, {
      token : "text",
      regex : "\\s+"
    } ]
  };

  this.normalizeRules();
};

oop.inherits(SumologicHighlightRules, TextHighlightRules);

exports.SumologicHighlightRules = SumologicHighlightRules;
});

ace.define("ace/mode/sumologic_completions",["require","exports","module","ace/token_iterator", "ace/lib/lang"], function(require, exports, module) {
"use strict";

var lang = require("../lib/lang");

var sumologicKeyWords = [
  "_collector", "_index", "_source", "_sourceCategory", "_sourceHost", "_sourceName", "_view",
  "as", "by", "from", "in", "on", "matches", "regex", "nodrop", "with",
  "abs", "accum", "acos", "asin", "atan", "atan2", "avg",
  "backshift", "cbrt", "ceil", "concat", "cos", "cosh", "count", "count_distinct", "count_frequent",
  "diff", "exp", "expm1", "fields", "fillmissing", "filter", "first", "last", "floor", "format", "formatDate",
  "lookup", "hypot", "if", "ipv4ToNumber", "isNull", "isEmpty", "isBlank", "join",
  "length", "limit", "log", "log10", "log1p", "luhn", "num", "number", "toLong", "pct",
  "merge", "max", "min", "most_recent", "least_recent", "now", "outlier",
  "csv", "split", "json", "keyvalue", "kv", "xml",
  "parseDate", "parseHex", "pct_sampling", "predict", "queryEndTime", "queryStartTime", "queryTimeRange",
  "replace", "rollingstd", "round", "save", "sessionize", "sin", "sinh", "smooth", "sort", "sqrt", "stddev", "substring", "sum",
  "tan", "tanh", "timeslice", "toDegrees", "toLowerCase", "toUpperCase",
  "top", "toRadians", "total", "trace", "transaction", "transpose",
  "urldecode", "where", "getCIDRPrefix", "compareCIDRPrefix", "maskFromCIDR"
];

var keyWordsCompletions = sumologicKeyWords.map(function(word) {
  return {
    caption: word,
    value: word,
    meta: "keyword",
    score: Number.MAX_VALUE
  }
});

var sumologicFunctions = [
// TODO
];

function wrapText(str, len) {
  len = len || 60;
  var lines = [];
  var space_index = 0;
  var line_start = 0;
  var next_line_end = len;
  var line = "";
  for (var i = 0; i < str.length; i++) {
    if (str[i] === ' ') {
      space_index = i;
    } else if (i >= next_line_end  && space_index != 0) {
      line = str.slice(line_start, space_index);
      lines.push(line);
      line_start = space_index + 1;
      next_line_end = i + len;
      space_index = 0;
    }
  }
  line = str.slice(line_start);
  lines.push(line);
  return lines.join("&nbsp<br>");
}

function convertMarkDownTags(text) {
  text = text.replace(/```(.+)```/, "<pre>$1</pre>");
  text = text.replace(/`([^`]+)`/, "<code>$1</code>");
  return text;
}

function convertToHTML(item) {
  var docText = lang.escapeHTML(item.docText);
  docText = convertMarkDownTags(wrapText(docText, 40));
  return [
    "<b>", lang.escapeHTML(item.def), "</b>", "<hr></hr>", docText, "<br>&nbsp"
  ].join("");
}

var functionsCompletions = sumologicFunctions.map(function(item) {
  return {
    caption: item.name,
    value: item.value,
    docHTML: convertToHTML(item),
    meta: "function",
    score: Number.MAX_VALUE
  };
});

var SumologicCompletions = function() {};

(function() {
  this.getCompletions = function(state, session, pos, prefix, callback) {
    var completions = keyWordsCompletions.concat(functionsCompletions);
    callback(null, completions);
  };

}).call(SumologicCompletions.prototype);

exports.SumologicCompletions = SumologicCompletions;
});

ace.define("ace/mode/behaviour/sumologic",["require","exports","module","ace/lib/oop","ace/mode/behaviour","ace/mode/behaviour/cstyle","ace/token_iterator"], function(require, exports, module) {
"use strict";

var oop = require("../../lib/oop");
var Behaviour = require("../behaviour").Behaviour;
var CstyleBehaviour = require("./cstyle").CstyleBehaviour;
var TokenIterator = require("../../token_iterator").TokenIterator;

var SumologicBehaviour = function () {
  this.inherit(CstyleBehaviour);
}
oop.inherits(SumologicBehaviour, CstyleBehaviour);

exports.SumologicBehaviour = SumologicBehaviour;
});

ace.define("ace/mode/sumologic",["require","exports","module","ace/lib/oop","ace/mode/text","ace/mode/sumologic_highlight_rules"], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextMode = require("./text").Mode;
var SumologicHighlightRules = require("./sumologic_highlight_rules").SumologicHighlightRules;
var SumologicCompletions = require("./sumologic_completions").SumologicCompletions;
var SumologicBehaviour = require("./behaviour/sumologic").SumologicBehaviour;

var Mode = function() {
  this.HighlightRules = SumologicHighlightRules;
  this.$behaviour = new SumologicBehaviour();
  this.$completer = new SumologicCompletions();
  // replace keyWordCompleter
  this.completer = this.$completer;
};
oop.inherits(Mode, TextMode);

(function() {

  this.$id = "ace/mode/sumologic";
}).call(Mode.prototype);

exports.Mode = Mode;

});
