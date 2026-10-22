import test from 'node:test';
import assert from 'node:assert/strict';
import {phonePairingUrl,normalizePairCode,validPairCode} from '../src/pairing-link';
test('pairing QR carries an invite only in the same-origin phone fragment',()=>{
 const url=new URL(phonePairingUrl('https://example.test','ABCD2345'));
 assert.equal(url.origin,'https://example.test');assert.equal(url.pathname,'/phone');assert.equal(url.search,'');assert.equal(url.hash,'#pair=ABCD2345');
 assert.equal(normalizePairCode('abcd-2345'),'ABCD2345');assert.ok(validPairCode('ABCD2345'));
 assert.throws(()=>phonePairingUrl('https://example.test','/other?token=secret'));
});
