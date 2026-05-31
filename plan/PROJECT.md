# Project

I want to create a server that has the LLM interfact of chatGTP.
It expects a fixed prompt format.

"Give me a wordcloud for: <textblock>"

It will find all unique words, remove common words that don't say much, like "it, they, has, is, will, etc"
Find a wikipedia Check if we have a wikipedia entry for each of the words.

If so, download these, convert all these pages to "wordcloud", a list of unique terms.
Remove all common words again.

Merge all words, only keeping unique ones.
return this as a strinigied json array


## Testing
Make sure to include testcase for anything non trivial.
