BEGIN;
ALTER TABLE "AbuseBucket" DROP CONSTRAINT "AbuseBucket_key_check";
ALTER TABLE "AbuseBucket" ADD CONSTRAINT "AbuseBucket_key_check"
  CHECK (key ~ '^(api|login|callback):[a-f0-9]{5}$' OR key ~ '^login:(global|group:[0-7])$');
COMMIT;
